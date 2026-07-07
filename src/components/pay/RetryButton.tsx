"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { retrySend } from "@/app/app/pay/send-log/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      variant="secondary"
      size="sm"
      type="submit"
      disabled={pending}
      className="w-20"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
    </Button>
  );
}

export function RetryForm({ sendId }: { sendId: string }) {
  return (
    <form
      action={async () => {
        const result = await retrySend(sendId);
        if (result.success) {
          toast.success("Retry triggered successfully");
        } else {
          toast.error(result.error || "Failed to retry");
        }
      }}
    >
      <SubmitButton />
    </form>
  );
}
