"use server";

import { db } from "@/lib/db";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface ResetPasswordState {
  success: boolean;
  error?: string;
  userEmail?: string;
}

export async function checkResetPasswordState(): Promise<ResetPasswordState> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { success: false, error: "Invalid or expired recovery link" };
    }

    const memberships = await db.member.findMany({
      where: { userId: user.id },
      select: { role: true },
    });

    if (memberships.length > 0 && memberships.every((m) => m.role === "deactivated")) {
      return {
        success: false,
        error: "Your account is deactivated. Please contact an administrator.",
      };
    }

    return { success: true, userEmail: user.email };
  } catch {
    return { success: false, error: "Invalid or expired recovery link" };
  }
}
