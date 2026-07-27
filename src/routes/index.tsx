import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/" as any)({
  beforeLoad: () => {
    throw redirect({ to: "/_authenticated", replace: true } as any);
  },
  component: () => null,
});
