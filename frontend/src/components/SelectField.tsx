import { type ReactElement, type ReactNode } from "react";
import { type FieldError, type UseFormRegisterReturn } from "react-hook-form";

type SelectFieldProps = {
  label: string;
  id: string;
  icon?: ReactElement;
  register: UseFormRegisterReturn;
  error?: FieldError;
  errorMessage?: string;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

export default function SelectField({
  label,
  id,
  icon,
  register,
  error,
  errorMessage,
  required,
  disabled,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <div className="w-full">
      <label htmlFor={id} className="label text-gray-900 mb-2">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="icon absolute left-2 top-1/2 -translate-y-1/2 z-2 border-r pr-2 h-full flex items-center justify-center">
            {icon}
          </div>
        )}
        <select
          id={id}
          required={required}
          disabled={disabled}
          className={`input input-bordered w-full bg-white shadow dark:text-white ${
            error ? "border-red-500" : ""
          } ${icon ? "pl-12" : ""}`}
          {...register}
          {...rest}
        >
          {children}
        </select>
      </div>
      {error && (
        <span className="text-red-500 text-sm block h-3 mt-1">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
