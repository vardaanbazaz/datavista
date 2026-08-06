import { motion } from "framer-motion";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { Upload, Filter, BarChart3, Download, Sparkles } from "lucide-react";

import { useUiStore } from "@/store/uiStore";

export function WelcomeOverlay() {
  const isVisible = useUiStore((state) => state.showWelcome);
  const onClose = () => useUiStore.getState().setShowWelcome(false);

  const features = [
    {
      icon: Upload,
      title: "Upload Data",
      description: "Import CSV, TSV, or XLSX files to get started",
      color: "text-blue-500",
      tooltip: "Supports drag and drop up to 100MB"
    },
    {
      icon: Filter,
      title: "Advanced Filtering",
      description: "Multi-select filters, date ranges, and real-time grouping",
      color: "text-purple-500",
      tooltip: "Filter across any column dynamically"
    },
    {
      icon: BarChart3,
      title: "Interactive Charts",
      description: "Bar, line, pie, scatter, histogram, heatmap, area, and bubble charts",
      color: "text-green-500",
      tooltip: "8+ chart types with custom formatting"
    },
    {
      icon: Download,
      title: "Export & Share",
      description: "PNG, SVG, CSV, and comprehensive PDF report exports",
      color: "text-orange-500",
      tooltip: "Export clean vector charts or raw data"
    }
  ];

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 text-zinc-900 dark:text-zinc-100">
        <DialogHeader className="text-center sm:text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
              DataVista
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-base">
            Your professional data visualization & analytics platform
          </DialogDescription>
          <div className="flex justify-center pt-1">
            <Badge variant="outline" className="px-3 py-1 text-xs">
              🚀 Powered by AI Insights & High-Performance Pivot Engine
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Tooltip key={feature.title}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.08 }}
                      className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800/80 bg-gray-50/50 dark:bg-zinc-900/50 hover:bg-gray-100/80 dark:hover:bg-zinc-800/80 transition-all cursor-default"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 ${feature.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">{feature.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{feature.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <div className="text-center pt-4 border-t border-gray-200 dark:border-zinc-800">
            <p className="text-xs text-muted-foreground mb-4">
              Ready to transform raw datasets into actionable visualizations?
            </p>

            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-block"
                >
                  <Button
                    onClick={onClose}
                    variant="premium"
                    size="lg"
                    className="text-base px-8 py-6 font-semibold shadow-lg"
                  >
                    Let's Get Started! ✨
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Close welcome guide and enter DataVista workspace</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}