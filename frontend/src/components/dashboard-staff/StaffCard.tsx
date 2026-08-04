import { useStaff } from "@/hooks/useStaff";
import type { ShopMemberDetail } from "@/types/shop";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import Swal from "sweetalert2";
import { useLang } from "@/hooks/useLang";
import toast from "react-hot-toast";
import { generateRoleColors } from "@/utils/roleColors";

interface StaffCardProps {
  member: ShopMemberDetail;
  shopId: string;
}

const StaffCard: React.FC<StaffCardProps> = ({ member, shopId }) => {
  const { t } = useTranslation();
  const { currentLang } = useLang();

  const {
    roles,
    deleteMember,
    deleteMemberLoading,
    updateRole,
    updateRoleLoading,
  } = useStaff();

  const currentRoleColors = generateRoleColors(member.roleId.name);

  const handleRoleChange = async (memberId: string, newRoleId: string) => {
    try {
      await updateRole({ shopId, userId: memberId, roleId: newRoleId });
      toast.success(
        t("staffPage.updateMemberSuccess") || "Role updated successfully",
      );
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error(t("staffPage.updateMemberError") || "Failed to update role");
    }
  };

  const handleDeleteMember = async (member: ShopMemberDetail) => {
    const result = await Swal.fire({
      title:
        currentLang == "en"
          ? `Delete ${member.userId.firstName} ${member.userId.lastName}?`
          : `حذف ${member.userId.firstName} ${member.userId.lastName}؟`,
      text: t("staffPage.confirmDelete"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t("staffPage.delete"),
      cancelButtonText: t("staffPage.cancel"),
      customClass: {
        confirmButton:
          "bg-primary hover:bg-darker-primary p-4 rounded-xl mx-2 text-primary-foreground cursor-pointer",
        cancelButton:
          "bg-destructive hover:bg-destructive/80 p-4 rounded-xl text-primary-foreground cursor-pointer",
      },
      buttonsStyling: false,
    });
    if (result.isConfirmed) {
      try {
        await deleteMember({ shopId, userId: member.userId._id });
        toast.success(
          currentLang == "en"
            ? `${member.userId.firstName} ${member.userId.lastName} has been deleted successfully`
            : `تم حذف  ${member.userId.firstName} ${member.userId.lastName} بنجاح`,
        );
      } catch (error) {
        console.log(error);
        toast.error(t("menu.delete.error"));
      }
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {member.userId.firstName.charAt(0)}
            {member.userId.lastName.charAt(0)}
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {member.userId.firstName} {member.userId.lastName}
            </div>
          </div>
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 dark:text-gray-200">
          {member.userId.email}
        </div>
      </td>

      <td>
        <div className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
          {member.userId.phoneNumber || "N/A"}
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="relative">
          {/* Enhanced dropdown with custom styling */}
          <div className="relative">
            <select
              value={member.roleId._id}
              onChange={(e) =>
                handleRoleChange(member.userId._id, e.target.value)
              }
              disabled={updateRoleLoading}
              className={`
                appearance-none relative pl-4 pr-10 py-2.5 text-sm font-semibold rounded-xl
                border-2 focus:ring-4 focus:ring-primary/20 focus:border-primary
                transition-all duration-300 cursor-pointer min-w-[120px]
                shadow-sm hover:shadow-md
                ${currentRoleColors.bg} ${currentRoleColors.text} ${currentRoleColors.border} ${currentRoleColors.hover}
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm
                focus:outline-none focus:scale-105 hover:scale-102
                backdrop-blur-sm
              `}
              style={{
                backgroundImage: "none",
              }}
            >
              {roles.map((role) => (
                <option
                  key={role._id}
                  value={role._id}
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-4"
                >
                  {role.name}
                </option>
              ))}
            </select>
            {/* Loading overlay */}
            {updateRoleLoading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 rounded-xl flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleDeleteMember(member)}
            disabled={deleteMemberLoading}
            className={`
                flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                font-medium text-sm transition-all duration-200
                bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400
                hover:bg-red-500 hover:text-white
                border border-red-200 dark:border-red-800 hover:border-red-500
                disabled:opacity-50 disabled:cursor-not-allowed
                group/delete cursor-pointer
              `}
          >
            <Trash2 className="w-4 h-4 group-hover/delete:scale-110 transition-transform" />
            <span>{t("menu.cards.delete")}</span>
          </button>
        </div>
      </td>
    </tr>
  );
};

export default StaffCard;
