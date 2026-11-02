import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Crown,
  Flame,
  GitBranch,
  LayoutDashboard,
  Puzzle,
  Shield,
  Skull,
  Swords,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

const middlegame = [
  { title: "Tactics Training", url: "/middlegame/tactics", icon: Puzzle },
  { title: "Guess the Move", url: "/middlegame/guess-the-move", icon: Crown },
  { title: "Simplification", url: "/middlegame/simplification", icon: GitBranch },
  { title: "Defensive Drills", url: "/middlegame/defense", icon: Shield },
  { title: "Checkmates", url: "/middlegame/checkmates", icon: Skull },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground font-display text-lg">
            ♞
          </div>
          {!collapsed && <span className="font-display text-lg font-semibold">Chess Buddy</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Repertoire</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path === "/"} tooltip="Dashboard">
                  <Link to="/">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={path === "/opening-creator"}
                  tooltip="Opening Creator"
                >
                  <Link to="/opening-creator">
                    <BookOpen />
                    <span>Opening Creator</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Training</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path.startsWith("/middlegame")}
                  tooltip="Middlegame Suite"
                  asChild
                >
                  <Link to="/middlegame/tactics">
                    <Swords />
                    <span>Middlegame Suite</span>
                  </Link>
                </SidebarMenuButton>
                {!collapsed && (
                  <SidebarMenuSub>
                    {middlegame.map((m) => (
                      <SidebarMenuSubItem key={m.url}>
                        <SidebarMenuSubButton asChild isActive={path === m.url}>
                          <Link to={m.url}>
                            <m.icon />
                            <span>{m.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
              {collapsed &&
                middlegame.map((m) => (
                  <SidebarMenuItem key={m.url}>
                    <SidebarMenuButton asChild isActive={path === m.url} tooltip={m.title}>
                      <Link to={m.url}>
                        <m.icon />
                        <span>{m.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={path === "/endgame"}
                  tooltip="Endgame Laboratory"
                >
                  <Link to="/endgame">
                    <Flame />
                    <span>Endgame Laboratory</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
