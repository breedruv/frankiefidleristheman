"use client";

import { useRef } from "react";

export default function AutoSubmitSelect({
  label,
  name,
  options,
  defaultValue,
  hiddenInputs,
  className,
  buttonLabel = "Apply"
}) {
  const formRef = useRef(null);

  const handleChange = () => {
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} className={className} method="get">
      {label ? <span>{label}</span> : null}
      {hiddenInputs
        ? Object.entries(hiddenInputs).map(([key, value]) =>
            value === null || value === undefined || value === "" ? null : (
              <input key={key} type="hidden" name={key} value={value} />
            )
          )
        : null}
      <select name={name} defaultValue={defaultValue} onChange={handleChange}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button className="ghost-pill" type="submit">{buttonLabel}</button>
    </form>
  );
}
