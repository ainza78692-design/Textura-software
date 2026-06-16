import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ServerConnectionCard } from "@/components/server-connection-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({ component: Settings });

function Settings() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="w-full max-w-7xl mx-auto animate-rise-in">
      <PageHeader
        title="Settings"
        description="Workspace configuration, notifications, and workflow defaults."
      />
      <div className="space-y-6">
        <ServerConnectionCard
          onServerChanged={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
        />

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
            <CardDescription>Company details shown on exports.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input defaultValue="Textura Mills Pvt Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input defaultValue="27AABCT1332L1Z6" />
            </div>
            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <Input defaultValue="INR ₹" />
            </div>
            <div className="space-y-1.5">
              <Label>Fiscal year start</Label>
              <Input defaultValue="April" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["Email when invoice is rejected", true],
              ["Daily pending aging digest", true],
              ["Slack alerts for >14d pending", false],
              ["Weekly client-wise report", true],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex items-center justify-between">
                <div className="text-sm">{label}</div>
                <Switch defaultChecked={Boolean(val)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Workflow Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">Auto-mark new docs as Pending</div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-sm">Require remark on rejection</div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-sm">Lock invoice after Final Submit</div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
