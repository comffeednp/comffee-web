"use client";

import { useEffect } from "react";

export default function BranchChatContext({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "comffe.chat.branch",
        JSON.stringify({ id: branchId, name: branchName }),
      );
    } catch {}
    return () => {
      try {
        sessionStorage.removeItem("comffe.chat.branch");
      } catch {}
    };
  }, [branchId, branchName]);

  return null;
}
