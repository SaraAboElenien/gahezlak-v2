import { type ReactElement } from "react";
import { type UseFormRegisterReturn, type FieldError } from "react-hook-form";

type InputFieldProps = {
  label: string;
  id: string;
  icon?: ReactElement;
  placeholder?: string;
  type?: string;
  register: UseFormRegisterReturn;
  error?: FieldError;
  errorMessage?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  required?: boolean;
  disabled?: boolean;
  accept?: string;
  classes?: string;
  value?: string | null;
};

export default function InputField({
  label,
  id,
  icon,
  placeholder,
  type = "text",
  register,
  error,
  errorMessage,
  step,
  min,
  max,
  required,
  disabled,
  accept,
  classes,
  value,
  ...rest
}: InputFieldProps) {
  return (
    <div className="w-full">
      <label htmlFor={id} className="label text-gray-900 mb-2">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="relative ">
        {icon && type !== "file" && (
          <div className="icon absolute left-2 top-1/2 -translate-y-1/2 z-2 border-r pr-2 h-full flex items-center justify-center">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          step={step}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          accept={accept}
          className={`input input-bordered w-full bg-white shadow dark:text-white ${classes} ${
            error ? "border-red-500" : ""
          }
            ${icon && type !== "file" ? "pl-12" : ""}
            ${
              type === "file"
                ? "file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-primary hover:file:bg-violet-100"
                : ""
            }`}
          {...register}
          {...rest}
          {...(type === "email" && value ? { value: value ?? "" } : {})}
        />
      </div>
      {error && (
        <span className="text-red-500 text-sm block h-3 mt-1">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
