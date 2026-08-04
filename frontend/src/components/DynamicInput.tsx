import React from "react";
import { type DynamicInputProps } from "../types/validations/menu/menu";

const DynamicInput: React.FC<DynamicInputProps> = ({
  type,
  label,
  value,
  onChange,
  placeholder,
  options,
  required = false,
  className = "",
}) => {
  const baseInputClasses =
    "input input-bordered w-full focus:input-primary transition-colors";

  return (
    <div className={`form-control w-full ${className}`}>
      <label className="label">
        <span className="label-text font-medium">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </span>
      </label>

      {type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`select select-bordered w-full focus:select-primary ${
            !value ? "text-gray-400" : ""
          }`}
          required={required}
        >
          <option value="" disabled>
            {placeholder || `اختر ${label}`}
          </option>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseInputClasses}
          required={required}
        />
      )}
    </div>
  );
};

export default DynamicInput;
