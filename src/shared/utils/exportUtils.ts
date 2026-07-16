import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { ChartConfig, DataRow, Dataset } from '@/shared/types';

/**
 * Recursively copy computed styles from source elements to target cloned elements
 * to ensure that SVG and HTML elements maintain their styles (and CSS variables resolution)
 * when rendered outside of the DOM context.
 */
const inlineStyles = (source: Element, target: Element) => {
  const computedStyle = window.getComputedStyle(source);
  
  // Style properties to copy for SVG/HTML element preservation
  const propertiesToCopy = [
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'font-family', 'font-size', 'font-weight',
    'text-anchor', 'opacity', 'color', 'display', 'visibility'
  ];

  propertiesToCopy.forEach(prop => {
    const value = computedStyle.getPropertyValue(prop);
    if (value) {
      (target as HTMLElement).style.setProperty(prop, value);
    }
  });

  // Recursively inline styles for children
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  
  sourceChildren.forEach((srcChild, index) => {
    const tgtChild = targetChildren[index];
    if (tgtChild) {
      inlineStyles(srcChild, tgtChild);
    }
  });
};

export const exportChartAsPNG = async (chart: ChartConfig): Promise<void> => {
  const chartElement = document.querySelector(`[data-chart-id="${chart.id}"]`) as HTMLElement;
  
  if (!chartElement) {
    throw new Error('Chart element not found');
  }

  try {
    const isDark = document.documentElement.classList.contains('dark');
    const computedBg = window.getComputedStyle(chartElement).backgroundColor;
    const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') 
      ? computedBg 
      : (isDark ? '#09090b' : '#ffffff');

    const canvas = await html2canvas(chartElement, {
      backgroundColor: bg,
      scale: 2, // Higher resolution
      logging: false,
      useCORS: true,
    });

    canvas.toBlob((blob) => {
      if (blob) {
        saveAs(blob, `${chart.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
      }
    });
  } catch (error) {
    console.error('Error exporting chart as PNG:', error);
    throw error;
  }
};

export const exportChartAsSVG = async (chart: ChartConfig): Promise<void> => {
  const svgElement = document.querySelector(`[data-chart-id="${chart.id}"] svg`) as SVGElement;
  
  if (!svgElement) {
    throw new Error('SVG element not found');
  }

  try {
    // Clone the SVG to avoid modifying the original
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    
    // Inline computed styles from original elements to capture theme colors and CSS variables
    inlineStyles(svgElement, svgClone);

    // Convert SVG to string
    const svgString = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    
    saveAs(blob, `${chart.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.svg`);
  } catch (error) {
    console.error('Error exporting chart as SVG:', error);
    throw error;
  }
};

export const exportDataAsCSV = async (data: DataRow[], filename: string): Promise<void> => {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  try {
    // Get all column names
    const columns = Object.keys(data[0]);
    
    // Create CSV content with correct escaping
    const csvContent = [
      // Header row
      columns.join(','),
      // Data rows
      ...data.map(row => 
        columns.map(col => {
          const value = row[col];
          if (value === null || value === undefined) return '';
          const strValue = typeof value === 'string' ? value : String(value);
          // If the value contains quotes, commas, or newlines, escape them
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n') || strValue.includes('\r')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_filtered.csv`);
  } catch (error) {
    console.error('Error exporting data as CSV:', error);
    throw error;
  }
};

export const generatePDFReport = async (
  dataset: Dataset, 
  filteredData: DataRow[], 
  charts: ChartConfig[]
): Promise<void> => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;

    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DataVista Report', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 15;
    
    // Dataset info
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Dataset: ${dataset.name}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Total Records: ${dataset.data.length}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Filtered Records: ${filteredData.length}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPosition);
    yPosition += 15;

    // Data Summary
    if (filteredData.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Data Summary', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
      // Calculate summary statistics for numeric columns
      const numericColumns = Object.entries(dataset.columnTypes)
        .filter(([_, type]) => type === 'numeric')
        .map(([col, _]) => col);

      numericColumns.forEach(col => {
        const values = filteredData
          .map(row => Number(row[col]))
          .filter(val => !isNaN(val));
        
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          
          pdf.text(`${col}: Min=${min.toFixed(2)}, Max=${max.toFixed(2)}, Avg=${avg.toFixed(2)}`, 20, yPosition);
          yPosition += 6;
        }
      });
      
      yPosition += 10;
    }

    // Charts
    if (charts.length > 0) {
      // Check if we need a new page for charts section header
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 20;
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Charts', 20, yPosition);
      yPosition += 15;

      for (const chart of charts) {
        // Check if we need a new page for chart title
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = 20;
        }

        // Chart title
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(chart.title, 20, yPosition);
        yPosition += 10;

        // Try to capture chart image
        try {
          const chartElement = document.querySelector(`[data-chart-id="${chart.id}"]`) as HTMLElement;
          if (chartElement) {
            const isDark = document.documentElement.classList.contains('dark');
            const computedBg = window.getComputedStyle(chartElement).backgroundColor;
            const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') 
              ? computedBg 
              : (isDark ? '#09090b' : '#ffffff');

            const canvas = await html2canvas(chartElement, {
              backgroundColor: bg,
              scale: 2, // High resolution capture
              logging: false,
              useCORS: true,
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 170; // standard width inside A4 printable area
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Check if adding this image would overflow the page
            if (yPosition + imgHeight > pageHeight - 20) {
              pdf.addPage();
              yPosition = 20;
            }

            pdf.addImage(imgData, 'PNG', 20, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 15;
          }
        } catch (error) {
          console.warn(`Could not capture chart ${chart.title}:`, error);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'italic');
          pdf.text('Chart image could not be captured', 20, yPosition);
          yPosition += 15;
        }
      }
    }

    // Save the PDF
    pdf.save(`${dataset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf`);
  } catch (error) {
    console.error('Error generating PDF report:', error);
    throw error;
  }
};