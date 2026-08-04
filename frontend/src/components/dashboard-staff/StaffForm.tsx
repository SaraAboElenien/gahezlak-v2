import {
  addStaffSchema,
  type AddStaffForm,
  type AddStaffRequest,
} from "@/types/validations/user/staff";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, Phone, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import InputField from "../InputField";
import { useStaff } from "@/hooks/useStaff";

interface StaffFormProps {
  onCancel: () => void;
  onSubmit: (data: AddStaffRequest) => void;
  error?: string | Error;
}

const StaffForm: React.FC<StaffFormProps> = ({ onCancel, onSubmit, error }) => {
  const { t } = useTranslation();
  const { roles, rolesLoading } = useStaff();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddStaffForm>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
      roleId: "",
    },
  });

  const handleFormSubmit = async (data: AddStaffForm) => {
    const { ...submittedData } = data;
    onSubmit(submittedData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
      {/* first name */}
      <InputField
        label={t("staffPage.form.firstName") || "First Name"}
        id="firstName"
        placeholder={t("staffPage.form.firstNamePlaceholder")}
        icon={<User className="text-gray-700 w-4 h-4" />}
        register={register("firstName")}
        error={errors.firstName}
        errorMessage={errors.firstName?.message}
      />

      {/* last Name */}
      <InputField
        label={t("staffPage.form.lastName") || "Last Name"}
        id="lastName"
        placeholder={t("staffPage.form.lastNamePlaceholder")}
        icon={<User className="text-gray-700 w-4 h-4" />}
        register={register("lastName")}
        error={errors.lastName}
        errorMessage={errors.lastName?.message}
      />

      {/* role */}
      <div>
        <label
          htmlFor="roleId"
          className="block text-sm font-medium text-foreground mb-2"
        >
          {t("staffPage.form.role")}
        </label>
        <select
          id="roleId"
          {...register("roleId")}
          className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                      focus:ring-2 focus:ring-primary focus:border-primary 
                      transition-all duration-200 hover:border-primary/60 shadow-sm"
          disabled={isSubmitting || rolesLoading}
        >
          <option value="">{t("staffPage.form.rolePlaceholder")}</option>
          {roles.map((role) => (
            <option key={role._id} value={role._id}>
              {role.name}
            </option>
          ))}
        </select>
        {errors.roleId && (
          <p className="text-destructive text-sm mt-1">
            {errors.roleId.message}
          </p>
        )}
      </div>

      {/* Email */}
      <InputField
        label={t("staffPage.form.email") || "E-mail"}
        id="email"
        type="email"
        placeholder={t("staffPage.form.emailPlaceholder")}
        icon={<Mail className="text-gray-700 w-4 h-4" />}
        register={register("email")}
        error={errors.email}
        errorMessage={errors.email?.message}
      />

      {/* Phone */}
      <InputField
        label={t("staffPage.form.phone") || "Phone"}
        id="phone"
        placeholder={t("staffPage.form.phonePlaceholder")}
        icon={<Phone className="text-gray-700 w-4 h-4" />}
        register={register("phoneNumber")}
        error={errors.phoneNumber}
        errorMessage={errors.phoneNumber?.message}
      />

      {/* Password */}
      <InputField
        label={t("staffPage.form.password") || "Password"}
        id="password"
        type="password"
        placeholder={t("staffPage.form.passwordPlaceholder")}
        icon={<Lock className="text-gray-700 w-4 h-4" />}
        register={register("password")}
        error={errors.password}
        errorMessage={errors.password?.message}
      />

      {/* Confirm Password */}
      <InputField
        label={t("staffPage.form.confirmPassword") || "Confirm Password"}
        id="confirmPassword"
        type="password"
        placeholder={t("staffPage.form.confirmPasswordPlaceholder")}
        icon={<Lock className="text-gray-700 w-4 h-4" />}
        register={register("confirmPassword")}
        error={errors.confirmPassword}
        errorMessage={errors.confirmPassword?.message}
      />

      {error && (
        <div className="p-3 text-md text-center text-red-600 bg-red-50 rounded-md dark:bg-red-900/20 dark:text-red-400">
          {typeof error === "string" ? error : error.message}
        </div>
      )}

      {/* actions */}
      <div className="flex justify-end gap-3 pt-6 border-t border-border">
        {/* cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 border border-border text-foreground rounded-lg 
                     hover:bg-muted transition-all duration-200 font-medium
                     focus:ring-2 focus:ring-ring focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          disabled={isSubmitting}
        >
          {t("menu.categories.form.cancel")}
        </button>
        {/* submit */}
        <button
          type="submit"
          className="flex items-center gap-2 bg-primary hover:bg-darker-primary 
                     text-primary-foreground px-8 py-3 rounded-lg font-medium 
                     transition-all duration-200 hover:shadow-lg 
                     transform hover:-translate-y-0.5 focus:ring-2 focus:ring-ring 
                     focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
                     disabled:hover:transform-none disabled:hover:shadow-none cursor-pointer"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center">
              {t("menu.categories.form.saving")}
            </span>
          ) : (
            t("menu.categories.form.add")
          )}
        </button>
      </div>
    </form>
  );
};

export default StaffForm;
