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

export type TopBarTab = {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
};

interface WorkspaceTopBarContextValue {
  actions: TopBarAction[];
  headerContent: ReactNode;
  viewToggle?: TopBarViewToggle;
  tabs: TopBarTab[];
  registerActions: (actions: TopBarAction[]) => void;
  registerHeaderContent: (content: ReactNode) => void;
  registerViewToggle: (toggle: TopBarViewToggle) => void;
  registerTabs: (tabs: TopBarTab[]) => void;
  clear: () => void;
}

const defaultValue: WorkspaceTopBarContextValue = {
  actions: [],
  headerContent: null,
  viewToggle: undefined,
  tabs: [],
  registerActions: () => {},
  registerHeaderContent: () => {},
  registerViewToggle: () => {},
  registerTabs: () => {},
  clear: () => {},
};

const WorkspaceTopBarContext = createContext<WorkspaceTopBarContextValue>(defaultValue);

export function WorkspaceTopBarProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<TopBarAction[]>([]);
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);
  const [viewToggle, setViewToggle] = useState<TopBarViewToggle | undefined>();
  const [tabs, setTabs] = useState<TopBarTab[]>([]);

  const registerActions = useCallback((newActions: TopBarAction[]) => {
    setActions(newActions);
  }, []);

  const registerHeaderContent = useCallback((content: ReactNode) => {
    setHeaderContent(content);
  }, []);

  const registerViewToggle = useCallback((toggle: TopBarViewToggle) => {
    setViewToggle(toggle);
  }, []);

  const registerTabs = useCallback((newTabs: TopBarTab[]) => {
    setTabs(newTabs);
  }, []);

  const clear = useCallback(() => {
    setActions([]);
    setHeaderContent(null);
    setViewToggle(undefined);
    setTabs([]);
  }, []);

  return (
    <WorkspaceTopBarContext.Provider
      value={{ actions, headerContent, viewToggle, tabs, registerActions, registerHeaderContent, registerViewToggle, registerTabs, clear }}
    >
      {children}
    </WorkspaceTopBarContext.Provider>
  );
}

export function useWorkspaceTopBar() {
  return useContext(WorkspaceTopBarContext);
}
