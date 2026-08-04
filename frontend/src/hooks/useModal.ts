import { useState, useCallback } from "react";

export interface UseModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useModal = (initialState = false): UseModalReturn => {
  const [isOpen, setIsOpen] = useState(initialState);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};

// Example usage in a component:
/*
const MyComponent = () => {
  const categoryModal = useModal();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    categoryModal.open();
  };

  const handleAdd = () => {
    setEditingCategory(null);
    categoryModal.open();
  };

  const handleClose = () => {
    categoryModal.close();
    setEditingCategory(null);
  };

  return (
    <div>
      <button onClick={handleAdd}>Add Category</button>
      
      <CategoryModal
        isOpen={categoryModal.isOpen}
        onClose={handleClose}
        editingCategory={editingCategory}
      />
    </div>
  );
};
*/
