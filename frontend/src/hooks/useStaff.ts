import { rolesApi } from "@/services/roles";
import { shopApi } from "@/services/shopApi";
import { staffApi } from "@/services/staff";
import type { AddStaffRequest } from "@/types/validations/user/staff";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const queryKeys = {
  roles: ["roles"] as const,
  shop: ["shop"] as const,
};

export const useStaff = () => {
  const queryClient = useQueryClient();

  // Roles
  const rolesQuery = useQuery({
    queryKey: queryKeys.roles,
    queryFn: rolesApi.GetRoles,
  });

  // GetShop
  const getShopByAdmin = (shopId: string | undefined) => {
    if (!shopId) return;
    return shopApi.GetShopById(shopId);
  };

  const useShopQuery = (shopId: string | undefined) => {
    return useQuery({
      queryKey: queryKeys.shop,
      queryFn: () => {
        if (!shopId) throw new Error("Shop ID is required");
        return getShopByAdmin(shopId);
      },
      enabled: !!shopId,
    });
  };

  // Get Staff Members
  const getMembersQuery = (shopId: string | undefined) => {
    if (!shopId) return;
    return staffApi.getMembers(shopId);
  };

  const useMembersQuery = (shopId: string | undefined) => {
    return useQuery({
      queryKey: ["members", shopId],
      queryFn: () => {
        if (!shopId) throw new Error("Shop ID is required");
        return getMembersQuery(shopId);
      },
      enabled: !!shopId,
    });
  };

  // Add Staff Member
  const addStaffMemberMutation = useMutation({
    mutationFn: (data: { shopId: string; formData: AddStaffRequest }) =>
      staffApi.addMember(data.shopId, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shop });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  // Update Staff Role
  const updateStaffRoleMutation = useMutation({
    mutationFn: (data: { shopId: string; userId: string; roleId: string }) =>
      staffApi.updateRole(data.shopId, data.userId, data.roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shop });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  //   Delete Staff Member
  const deleteStaffMemberMutation = useMutation({
    mutationFn: (data: { shopId: string; userId: string }) =>
      staffApi.deleteMember(data.shopId, data.userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shop });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  return {
    // roles
    roles: rolesQuery.data?.data || [],
    rolesLoading: rolesQuery.isLoading,
    rolesError: rolesQuery.error,

    // shop
    getShopByAdmin,
    useShopQuery,

    // members
    getMembersQuery,
    useMembersQuery,
    addMember: addStaffMemberMutation.mutateAsync,
    addMemberLoading: addStaffMemberMutation.isPending,
    updateRole: updateStaffRoleMutation.mutateAsync,
    updateRoleLoading: updateStaffRoleMutation.isPending,
    deleteMember: deleteStaffMemberMutation.mutateAsync,
    deleteMemberLoading: deleteStaffMemberMutation.isPending,
  };
};
