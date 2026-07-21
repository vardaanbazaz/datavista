import { CommandPalette } from "@/features/workspace/components/CommandPalette";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  onOpenTemplateModal,
}: GlobalSearchModalProps) {
  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      onOpenTemplateModal={onOpenTemplateModal}
    />
  );
}

export { CommandPalette };
