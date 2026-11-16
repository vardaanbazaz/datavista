import { lazy, Suspense, useEffect } from "react";
import { useUiStore } from "@/store/uiStore";
import { toast } from "@/shared/hooks/use-toast";
import { MIGRATION_NOTICE_KEY } from "@/features/ai/settings/keyStorage";
import { getProvider } from "@/features/ai/providers/registry";

const AiSettingsModal = lazy(() => import("./AiSettingsModal"));

/**
 * The one AI settings dialog (opened from anywhere with uiStore.setIsAiSettingsOpen),
 * loaded only when first opened. Also says once that an old-style key was kept as
 * "remembered on this device".
 */
export function AiSettingsHost() {
  const isOpen = useUiStore((s) => s.isAiSettingsOpen);
  const setOpen = useUiStore((s) => s.setIsAiSettingsOpen);

  useEffect(() => {
    let providerId: string | null = null;
    try {
      providerId = localStorage.getItem(MIGRATION_NOTICE_KEY);
      if (providerId) localStorage.removeItem(MIGRATION_NOTICE_KEY);
    } catch {
      return;
    }
    if (!providerId) return;
    toast({
      title: "Your AI key was kept",
      description: `Your saved ${getProvider(providerId).label} key is now “Remembered on this device”. New keys are kept for the session only unless you choose otherwise in AI settings.`,
    });
  }, []);

  if (!isOpen) return null;
  return (
    <Suspense fallback={null}>
      <AiSettingsModal isOpen={isOpen} onClose={() => setOpen(false)} />
    </Suspense>
  );
}
