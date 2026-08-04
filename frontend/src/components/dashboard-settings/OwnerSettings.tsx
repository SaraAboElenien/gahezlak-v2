import { useState } from "react";
// import Swal from "sweetalert2";
// import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Mail, Lock } from "lucide-react";
import EmailChangeModal from "./EmailChangeModal";
import PasswordChangeModal from "./PasswordChangeModal";
import { ActionButtons } from "./ActionButtons";
import { useProfile } from "@/hooks/useProfile";
import Loader from "../Loader";
import { ErrorComponent } from "../ErrorComponent";
import { useProfileForm } from "@/hooks/useProfileForm";
import OwnerForm from "./OwnerForm";

export default function OwnerSettings() {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const {
    user: userData,
    loading: isLoading,
    error,
    refreshProfile: refetch,
  } = useProfile();
  const { form, onSubmit, isSubmitting, submitError } = useProfileForm(
    userData,
    () => {
      setIsEditing(false);
    },
  );

  const handleEdit = () => setIsEditing(true);

  const handleCancel = () => {
    form.reset();
    setIsEditing(false);
  };

  // const handleDelete = async () => {
  //   const result = await Swal.fire({
  //     title: "Delete Restaurant?",
  //     text: "You won't be able to revert this!",
  //     icon: "warning",
  //     showCancelButton: true,
  //     confirmButtonText: "Yes, delete it!",
  //     customClass: {
  //       confirmButton:
  //         "bg-primary hover:bg-darker-primary p-4 rounded-xl mr-2 text-primary-foreground cursor-pointer",
  //       cancelButton:
  //         "bg-destructive hover:bg-destructive/80 p-4 rounded-xl text-primary-foreground cursor-pointer",
  //     },
  //     buttonsStyling: false,
  //   });
  //   if (result.isConfirmed) {
  //     try {
  //       //   await deleteRestaurant();
  //       toast.success("Your Restaurant has been deleted!");
  //     } catch (error) {
  //       console.log(error)
  //       toast.error("Can't delete it please try again!");
  //     }
  //   }
  // };

  const handleSave = () => {
    form.handleSubmit((data) => onSubmit(data))();
  };

  if (isLoading) return <Loader />;
  if (error) return <ErrorComponent error={error} onRetry={refetch} />;

  return (
    <div className=" mx-auto">
      {/* Error message at the top */}
      {submitError && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {submitError}
        </div>
      )}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t("settings.owner.title")}
              </h2>
            </div>
            <ActionButtons
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              isDirty={form.formState.isDirty}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancel={handleCancel}
              // onDelete={handleDelete}
            />
          </div>
        </div>

        {/* Profile Form */}
        <div className="space-y-4 p-6">
          <OwnerForm form={form} isEditing={isEditing} onSubmit={onSubmit} />
          {/* Email Change Section */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-800 dark:text-white">
                {t("settings.owner.email")}
              </h3>
              <button
                type="button"
                onClick={() => setShowEmailChange(true)}
                className="flex items-center gap-2 px-3 py-3 text-sm text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
              >
                <Mail size={16} />
                {t("settings.actions.changeEmail")}
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              {userData?.email}
            </p>
          </div>

          {/* Password Change Section */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-800 dark:text-white">
                {t("settings.owner.password")}
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordChange(true)}
                className="flex items-center gap-2 px-3 py-3 text-sm text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
              >
                <Lock size={16} />
                {t("settings.actions.changePassword")}
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-300">••••••••</p>
          </div>
        </div>
      </div>

      <EmailChangeModal
        isOpen={showEmailChange}
        onClose={() => {
          setShowEmailChange(false);
        }}
        refetch={refetch}
      />

      <PasswordChangeModal
        isOpen={showPasswordChange}
        onClose={() => setShowPasswordChange(false)}
        refetch={refetch}
      />
    </div>
  );
}
