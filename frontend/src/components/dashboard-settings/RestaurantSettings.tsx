import { useTranslation } from "react-i18next";
import { useState } from "react";
// import Swal from "sweetalert2";
import { useProfile } from "@/hooks/useProfile";
import Loader from "../Loader";
import { ErrorComponent } from "../ErrorComponent";
import { ActionButtons } from "./ActionButtons";
import { useRestaurantForm } from "@/hooks/useRestaurantForm";
import { RestaurantForm } from "./RestaurantForm";
import { shopApi } from "@/services/shopApi";
import toast from "react-hot-toast";

const RestaurantSettings = () => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const {
    user: userData,
    loading: isLoading,
    error,
    refreshProfile: refetch,
  } = useProfile();
  const { form, onSubmit, isSubmitting, submitError } = useRestaurantForm(
    userData,
    () => setIsEditing(false),
    refetch,
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
    if (!userData?.shop?._id) {
      toast.error("Restaurant ID is missing");
      return;
    }

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
                {t("settings.restaurant.title")}
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

        {/* Form Content */}
        <div className="p-6">
          <RestaurantForm
            // Derived from the shop's current name rather than a stored image
            // URL (the old `shop.qrCodeUrl`, since removed from the profile
            // response): the backend renders this PNG on demand, so there is
            // nothing stored to go stale, and a just-saved rename is
            // reflected immediately without a regenerate step.
            qrImg={
              userData?.shop?.name
                ? shopApi.GetQrCodeImageUrl(userData.shop.name)
                : undefined
            }
            form={form}
            isEditing={isEditing}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default RestaurantSettings;
