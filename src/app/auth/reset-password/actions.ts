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

    if (memberships.length === 0 || memberships.every((m) => m.role === "deactivated")) {
      return {
        success: false,
        error: memberships.length === 0
          ? "Your account is not associated with any organization."
          : "Your account is deactivated. Please contact an administrator.",
      };
    }

    return { success: true, userEmail: user.email };
  } catch {
    return { success: false, error: "Invalid or expired recovery link" };
  }
}

export async function updatePassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Invalid or expired recovery link" };
    }

    const memberships = await db.member.findMany({
      where: { userId: user.id },
      select: { role: true },
    });

    if (memberships.length === 0 || memberships.every((m) => m.role === "deactivated")) {
      return {
        success: false,
        error: memberships.length === 0
          ? "Your account is not associated with any organization."
          : "Your account is deactivated. Please contact an administrator.",
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return { success: false, error: updateError.message ?? "Could not change password" };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Could not change password" };
  }
}

