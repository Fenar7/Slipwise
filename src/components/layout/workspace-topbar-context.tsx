"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type TopBarAction = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "subtle";
};

export type TopBarViewToggle = {
  mode: "form" | "document";
  onChange: (mode: "form" | "document") => void;
};

interface WorkspaceTopBarContextValue {
  actions: TopBarAction[];
  headerContent: ReactNode;
  viewToggle?: TopBarViewToggle;
  registerActions: (actions: TopBarAction[]) => void;
  registerHeaderContent: (content: ReactNode) => void;
  registerViewToggle: (toggle: TopBarViewToggle) => void;
  clear: () => void;
}

const defaultValue: WorkspaceTopBarContextValue = {
  actions: [],
  headerContent: null,
  viewToggle: undefined,
  registerActions: () => {},
  registerHeaderContent: () => {},
  registerViewToggle: () => {},
  clear: () => {},
};

const WorkspaceTopBarContext = createContext<WorkspaceTopBarContextValue>(defaultValue);

export function WorkspaceTopBarProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<TopBarAction[]>([]);
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);
  const [viewToggle, setViewToggle] = useState<TopBarViewToggle | undefined>();

  const registerActions = useCallback((newActions: TopBarAction[]) => {
    setActions(newActions);
  }, []);

  const registerHeaderContent = useCallback((content: ReactNode) => {
    setHeaderContent(content);
  }, []);

  const registerViewToggle = useCallback((toggle: TopBarViewToggle) => {
    setViewToggle(toggle);
  }, []);

  const clear = useCallback(() => {
    setActions([]);
    setHeaderContent(null);
    setViewToggle(undefined);
  }, []);

  return (
    <WorkspaceTopBarContext.Provider
      value={{ actions, headerContent, viewToggle, registerActions, registerHeaderContent, registerViewToggle, clear }}
    >
      {children}
    </WorkspaceTopBarContext.Provider>
  );
}

export function useWorkspaceTopBar() {
  return useContext(WorkspaceTopBarContext);
}
