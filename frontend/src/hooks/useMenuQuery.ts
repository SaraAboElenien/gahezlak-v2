import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryApi } from "@/services/categoryApi";
import type { CategoryFormInputs } from "@/types/validations/menu/category";
import { menuItemApi } from "@/services/menuItemsApi";
import { menuOCRApi } from "@/services/menuOCR";

export const queryKeys = {
  categories: ["categories"] as const,
  menuItems: ["menuItems"] as const,
  category: (id: string) => ["categories", id] as const,
  menuItem: (id: string) => ["menuItems", id] as const,
};

export const useMenuQuery = () => {
  const queryClient = useQueryClient();

  // Categories
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoryApi.GetCategories,
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: CategoryFormInputs) => categoryApi.CreateCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ data, _id }: { data: CategoryFormInputs; _id: string }) =>
      categoryApi.UpdateCategory(data, _id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (_id: string) => categoryApi.DeleteCategory(_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      queryClient.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });

  // Menu Items
  const menuItemsQuery = useQuery({
    queryKey: queryKeys.menuItems,
    queryFn: menuItemApi.GetMenuItems,
  });

  const createMenuItemMutation = useMutation({
    mutationFn: (data: FormData) => menuItemApi.CreateMenuItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: ({ data, _id }: { data: FormData; _id: string }) =>
      menuItemApi.UpdateMenuItem(data, _id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: (_id: string) => menuItemApi.DeleteMenuItem(_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });

  // OCR
  const uploadMenuUsingOCRMutation = useMutation({
    mutationFn: (data: FormData) => menuOCRApi.CreateMenuUsingOCR(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menuItems });
    },
  });

  return {
    // Categories
    categories: categoriesQuery.data?.data || [],
    categoriesLoading: categoriesQuery.isLoading,
    categoriesError: categoriesQuery.error,
    createCategory: createCategoryMutation.mutateAsync,
    updateCategory: updateCategoryMutation.mutateAsync,
    deleteCategory: deleteCategoryMutation.mutateAsync,
    createCategoryLoading: createCategoryMutation.isPending,
    updateCategoryLoading: updateCategoryMutation.isPending,
    deleteCategoryLoading: deleteCategoryMutation.isPending,

    // Menu Items
    menuItems: menuItemsQuery.data?.data || [],
    menuItemsLoading: menuItemsQuery.isLoading,
    menuItemsError: menuItemsQuery.error,
    createMenuItem: createMenuItemMutation.mutateAsync,
    updateMenuItem: updateMenuItemMutation.mutateAsync,
    deleteMenuItem: deleteMenuItemMutation.mutateAsync,
    createMenuItemLoading: createMenuItemMutation.isPending,
    updateMenuItemLoading: updateMenuItemMutation.isPending,
    deleteMenuItemLoading: deleteMenuItemMutation.isPending,

    // OCR
    uploadMenuUsingOCR: uploadMenuUsingOCRMutation.mutateAsync,
    uploadMenuUsingOCRLoading: uploadMenuUsingOCRMutation.isPending,
  };
};
