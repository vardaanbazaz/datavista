import { CommandPalette } from "@/features/workspace/components/CommandPalette";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
  initialQuery?: string;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  onOpenTemplateModal,
  initialQuery,
}: GlobalSearchModalProps) {
  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      onOpenTemplateModal={onOpenTemplateModal}
      initialQuery={initialQuery}
    />
  );
}

export { CommandPalette };
