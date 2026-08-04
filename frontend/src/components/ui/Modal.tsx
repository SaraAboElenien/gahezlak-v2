import { useEffect, useRef, useImperativeHandle } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

export interface ModalRef {
  scrollContentToTop: () => void;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  actions?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  maxHeight?: string; // New prop for controlling max height
  ref?: React.Ref<ModalRef>; // New ref prop
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  actions,
  className = "",
  ariaLabel,
  ariaDescribedBy,
  maxHeight = "80vh", // Default max height
  ref,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useImperativeHandle(ref, () => ({
    scrollContentToTop: () => {
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    },
  }));

  // Size classes mapping
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  useEffect(() => {
    if (isOpen) {
      // Store previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal
      modalRef.current?.focus();

      // Prevent body scroll
      document.body.style.overflow = "hidden";

      // Add aria-hidden to main content
      const mainContent = document.querySelector("main");
      if (mainContent) {
        mainContent.setAttribute("aria-hidden", "true");
      }
    } else {
      // Restore body scroll
      document.body.style.overflow = "";

      // Remove aria-hidden from main content
      const mainContent = document.querySelector("main");
      if (mainContent) {
        mainContent.removeAttribute("aria-hidden");
      }

      // Restore focus to previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = "";
      const mainContent = document.querySelector("main");
      if (mainContent) {
        mainContent.removeAttribute("aria-hidden");
      }
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, closeOnEscape, onClose]);

  // Handle focus trap
  useEffect(() => {
    const handleFocusTrap = (event: KeyboardEvent) => {
      if (!isOpen || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      if (event.key === "Tab") {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            event.preventDefault();
          }
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleFocusTrap);
    }

    return () => {
      document.removeEventListener("keydown", handleFocusTrap);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
      aria-describedby={ariaDescribedBy}
    >
      <div
        ref={modalRef}
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} ${className} flex flex-col`}
        style={{ maxHeight }}
        tabIndex={-1}
        role="document"
      >
        {/* Fixed Header */}
        <div className="p-6 border-b border-slate-200 bg-primary text-white">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold  mx-auto " id="modal-title">
              {title}
            </h2>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="hover:text-gray-500 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="p-6 overflow-y-auto flex-1 min-h-0"
          id="modal-content"
          ref={contentRef}
        >
          {children}
        </div>

        {/* Fixed Actions */}
        {actions && (
          <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3 rounded-b-lg border-t border-gray-200 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );

  // Render in portal for better SEO and accessibility
  return createPortal(modalContent, document.body);
};

export default Modal;
