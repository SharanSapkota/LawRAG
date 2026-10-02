import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconOnly = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  const classes = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    iconOnly ? "btn-icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 13 : 15} /> : icon}
      {children}
    </button>
  );
});
