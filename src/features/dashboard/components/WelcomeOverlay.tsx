import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { X, Upload, Filter, BarChart3, Download, Sparkles } from "lucide-react";

import { useUiStore } from "@/store/uiStore";

export function WelcomeOverlay() {
  const isVisible = useUiStore((state) => state.showWelcome);
  const onClose = () => useUiStore.getState().setShowWelcome(false);
  const features = [
    {
      icon: Upload,
      title: "Upload Data",
      description: "Import CSV files or use sample data to get started",
      color: "text-blue-500"
    },
    {
      icon: Filter,
      title: "Advanced Filtering",
      description: "Multi-select filters, date ranges, and real-time grouping",
      color: "text-purple-500"
    },
    {
      icon: BarChart3,
      title: "8 Chart Types",
      description: "Bar, line, pie, scatter, histogram, heatmap, area, and bubble charts",
      color: "text-green-500"
    },
    {
      icon: Download,
      title: "Export Everything",
      description: "PNG, SVG, CSV, and comprehensive PDF reports",
      color: "text-orange-500"
    }
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/95 backdrop-blur-md z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="max-w-2xl w-full"
          >
            <Card className="glass shadow-glow border-primary/20">
              <CardHeader className="text-center relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="absolute right-2 top-2"
                >
                  <X className="h-4 w-4" />
                </Button>
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="mx-auto mb-4 p-3 rounded-full gradient-primary w-fit"
                >
                  <Sparkles className="h-8 w-8 text-white" />
                </motion.div>
                
                <CardTitle className="text-3xl font-bold mb-2">
                  Welcome to{" "}
                  <span className="gradient-primary bg-clip-text text-transparent">
                    DataVista
                  </span>
                </CardTitle>
                
                <p className="text-muted-foreground text-lg">
                  Your professional data visualization platform
                </p>
                
                <div className="flex justify-center mt-4">
                  <Badge variant="outline" className="px-3 py-1">
                    🚀 Now with AI-powered insights
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {features.map((feature, index) => {
                    const Icon = feature.icon;
                    return (
                      <motion.div
                        key={feature.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                        className="p-4 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg bg-background ${feature.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="font-semibold mb-1">{feature.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                
                <div className="text-center pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground mb-4">
                    Ready to transform your data into beautiful visualizations?
                  </p>
                  
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button 
                      onClick={onClose}
                      variant="premium"
                      size="lg"
                      className="text-lg px-8"
                    >
                      Let's Get Started! ✨
                    </Button>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}