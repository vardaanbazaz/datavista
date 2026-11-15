import type { Dataset } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";

/** The small sales table behind "Try with sample data" (Overview, Upload, first-run setup). */
export function sampleDataset(): Dataset {
  return {
    id: "sample-sales-data",
    name: "Sample Sales Data",
    data: [
      { Product: "Laptop", Category: "Electronics", Sales: 1200, Profit: 300, Region: "North" },
      { Product: "Phone", Category: "Electronics", Sales: 800, Profit: 200, Region: "South" },
      { Product: "Tablet", Category: "Electronics", Sales: 600, Profit: 150, Region: "East" },
      { Product: "Desk Chair", Category: "Furniture", Sales: 350, Profit: 80, Region: "West" },
      { Product: "Bookshelf", Category: "Furniture", Sales: 280, Profit: 70, Region: "North" },
      { Product: "Coffee Maker", Category: "Appliances", Sales: 120, Profit: 30, Region: "South" },
      { Product: "Monitor", Category: "Electronics", Sales: 400, Profit: 100, Region: "North" },
      { Product: "Office Chair", Category: "Furniture", Sales: 320, Profit: 90, Region: "South" },
      { Product: "Keyboard", Category: "Electronics", Sales: 150, Profit: 40, Region: "West" },
      { Product: "Mouse", Category: "Electronics", Sales: 50, Profit: 15, Region: "North" },
    ],
    columns: ["Product", "Category", "Sales", "Profit", "Region"],
    columnTypes: {
      Product: "categorical",
      Category: "categorical",
      Sales: "numeric",
      Profit: "numeric",
      Region: "categorical",
    },
  };
}

export function loadSampleDataset() {
  void useDatasetStore.getState().uploadDataset(sampleDataset());
}
