"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { ActivityBell } from "@/components/activity/activity-bell";
import { useState } from "react";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-14 items-center gap-2 px-4 border-b border-border lg:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigatie</SheetTitle>
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <Image src="/logo-icon.png" alt="QuickSolutions" width={24} height={24} className="h-5 w-5 object-contain" />
        <span className="text-sm font-semibold">QuickSolutions</span>
      </div>

      <div className="ml-auto">
        <ActivityBell mode="mobile" />
      </div>
    </div>
  );
}
