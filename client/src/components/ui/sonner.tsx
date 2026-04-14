import { Toaster as Sonner, type ToasterProps } from "sonner";

export const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-lg",
          title: "text-sm font-semibold",
          description: "text-sm text-neutral-600",
          actionButton: "bg-neutral-900 text-white",
          cancelButton: "bg-neutral-100 text-neutral-900",
          error: "border-red-200",
          success: "border-green-200",
        },
      }}
      {...props}
    />
  );
};

