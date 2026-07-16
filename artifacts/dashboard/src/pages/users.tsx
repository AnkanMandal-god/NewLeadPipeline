import React, { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useDeleteUser,
  useGetMe,
  getGetMeQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ShieldCheck, Phone } from "lucide-react";

type NewUserForm = { username: string; password: string; role: "admin" | "sales_caller" };

const EMPTY_FORM: NewUserForm = { username: "", password: "", role: "sales_caller" };

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data, isLoading } = useListUsers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; username: string } | null>(null);

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Account created", description: `${form.username} can now sign in.` });
        setDialogOpen(false);
        setForm(EMPTY_FORM);
      },
      onError: (err: any) => {
        toast({
          title: "Couldn't create account",
          description: err?.message ?? "Something went wrong.",
          variant: "destructive",
        });
      },
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Account removed" });
        setDeleteTarget(null);
      },
      onError: (err: any) => {
        toast({
          title: "Couldn't remove account",
          description: err?.message ?? "Something went wrong.",
          variant: "destructive",
        });
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ data: form });
  }

  const users = data?.users ?? [];

  if (me && me.user.role !== "admin") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-muted-foreground">Only admins can manage team accounts.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold uppercase tracking-tight">Team Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can sign in. Sales callers can only view leads and edit outreach fields.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm(EMPTY_FORM); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-user">
              <Plus className="h-4 w-4" />
              Add account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a team account</DialogTitle>
              <DialogDescription>
                Sales callers can view leads and update outreach status/notes. Admins have full access.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-username">Username</Label>
                <Input
                  id="new-username"
                  data-testid="input-new-username"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  data-testid="input-new-password"
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => setForm((f) => ({ ...f, role: value as NewUserForm["role"] }))}
                >
                  <SelectTrigger id="new-role" data-testid="select-new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_caller">Sales caller</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-new-user">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading accounts…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No accounts yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="gap-1">
                    {u.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                    {u.role === "admin" ? "Admin" : "Sales caller"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={u.id === me?.user?.id}
                    onClick={() => setDeleteTarget({ id: u.id, username: u.username })}
                    data-testid={`button-delete-user-${u.id}`}
                    aria-label={`Remove ${u.username}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately revokes their access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
