"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { type ColumnDef, DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type RegistrationRow = {
	id: string;
	created_at: string;
	reviewed_at?: string | null;
	real_name: string | null;
	nickname: string;
	email: string;
	phone: string | null;
	trading_experience: string;
	trading_style_preferences: string[];
	learning_goals: string | null;
	willing_to_recommend: boolean;
	student_id?: string | null;
	address?: string | null;
	status?: string | null;
	rejection_reason?: string | null;
	avatar_url?: string | null;
	emergency_phone?: string | null;
	profile_id?: string | null;
};

const STATUSES = ["pending", "approved", "rejected"] as const;

type EditState = {
	real_name: string;
	nickname: string;
	email: string;
	phone: string;
	address: string;
	student_id: string;
	emergency_phone: string;
	status: (typeof STATUSES)[number];
	learning_goals: string;
};

export function AdminStudentsPanel() {
	const t = useTranslations("Admin");
	const [students, setStudents] = useState<RegistrationRow[]>([]);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editingRow, setEditingRow] = useState<RegistrationRow | null>(null);
	const [edit, setEdit] = useState<EditState | null>(null);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const [noticeTarget, setNoticeTarget] = useState<RegistrationRow | null>(null);
	const [noticeTitle, setNoticeTitle] = useState("");
	const [noticeBody, setNoticeBody] = useState("");
	const [sendingNotice, setSendingNotice] = useState(false);

	useEffect(() => {
		const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
		return () => window.clearTimeout(id);
	}, [search]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const q = new URLSearchParams();
			if (debouncedSearch) q.set("search", debouncedSearch);
			if (status) q.set("status", status);
			const res = await fetch(`/api/admin/students?${q}`, { credentials: "include" });
			const data = (await res.json()) as { students?: RegistrationRow[]; error?: string };
			if (!res.ok) {
				setError(data.error ?? t("loadError"));
				return;
			}
			setStudents(data.students ?? []);
		} catch {
			setError(t("loadError"));
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, status, t]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void load();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	function startEdit(row: RegistrationRow) {
		setEditingRow(row);
		setEdit({
			real_name: row.real_name ?? "",
			nickname: row.nickname,
			email: row.email,
			phone: row.phone ?? "",
			address: row.address ?? "",
			student_id: row.student_id ?? "",
			emergency_phone: row.emergency_phone ?? "",
			status: (STATUSES.includes(row.status as (typeof STATUSES)[number])
				? row.status
				: "pending") as (typeof STATUSES)[number],
			learning_goals: row.learning_goals ?? "",
		});
	}

	async function saveEdit(id: string) {
		if (!edit) return;
		setSaving(true);
		setToast(null);
		try {
			const body: Record<string, unknown> = {
				nickname: edit.nickname,
				email: edit.email,
				status: edit.status,
			};
			body.real_name = edit.real_name.trim() || null;
			body.phone = edit.phone.trim() || null;
			body.address = edit.address.trim() || null;
			body.student_id = edit.student_id.trim() || null;
			body.learning_goals = edit.learning_goals.trim() || null;
			body.emergency_phone = edit.emergency_phone.trim() || null;

			const res = await fetch(`/api/admin/students/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(body),
			});
			const data = (await res.json()) as { student?: RegistrationRow; error?: string };
			if (!res.ok) {
				setToast(data.error ?? t("saveError"));
				return;
			}
			setToast(t("saved"));
			setEditingRow(null);
			setEdit(null);
			void load();
		} catch {
			setToast(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	function startNotice(row: RegistrationRow) {
		setNoticeTarget(row);
		setNoticeTitle("");
		setNoticeBody("");
		setToast(null);
	}

	async function sendNotice() {
		if (!noticeTarget?.profile_id) {
			setToast(t("sendNoticeNeedAccount"));
			return;
		}
		setSendingNotice(true);
		setToast(null);
		try {
			const res = await fetch("/api/admin/notices", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					userId: noticeTarget.profile_id,
					title: noticeTitle,
					body: noticeBody,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setToast(data.error ?? t("noticeSendFailed"));
				return;
			}
			setToast(t("noticeSent"));
			setNoticeTarget(null);
			setNoticeTitle("");
			setNoticeBody("");
		} catch {
			setToast(t("noticeSendFailed"));
		} finally {
			setSendingNotice(false);
		}
	}

	async function assignStudentId(id: string) {
		setSaving(true);
		setToast(null);
		try {
			const res = await fetch(`/api/admin/students/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ assign_student_id: true }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				setToast(data.error ?? t("saveError"));
				return;
			}
			setToast(t("saved"));
			void load();
		} catch {
			setToast(t("saveError"));
		} finally {
			setSaving(false);
		}
	}

	function statusLabel(s: string | null | undefined) {
		if (!s) return "�";
		if (STATUSES.includes(s as (typeof STATUSES)[number])) {
			return t(`status_${s}` as "status_registered");
		}
		return s;
	}

	const columns: ColumnDef<RegistrationRow>[] = [
		{
			id: "avatar",
			header: t("colAvatar"),
			cell: ({ row }) =>
				row.original.avatar_url ? (
					<Image
						src={row.original.avatar_url}
						alt=""
						width={32}
						height={32}
						className="size-8 rounded-full object-cover ring-1 ring-border"
						sizes="32px"
					/>
				) : (
					<span className="text-muted-foreground text-xs">�</span>
				),
		},
		{
			accessorKey: "created_at",
			header: t("colCreated"),
			cell: ({ row }) => (
				<span className="text-muted-foreground font-mono text-xs tabular-nums">
					{row.original.created_at?.slice(0, 10)}
				</span>
			),
		},
		{ accessorKey: "nickname", header: t("colNickname") },
		{
			accessorKey: "real_name",
			header: t("colRealName"),
			cell: ({ row }) => <span className="hidden lg:table-cell">{row.original.real_name ?? "�"}</span>,
		},
		{
			accessorKey: "email",
			header: t("colEmail"),
			cell: ({ row }) => (
				<span className="max-w-[160px] truncate font-mono text-xs">{row.original.email}</span>
			),
		},
		{
			accessorKey: "phone",
			header: t("colPhone"),
			cell: ({ row }) => <span className="hidden md:table-cell">{row.original.phone ?? "�"}</span>,
		},
		{
			accessorKey: "student_id",
			header: t("colStudentId"),
			cell: ({ row }) => <span className="font-mono text-xs">{row.original.student_id ?? "�"}</span>,
		},
		{
			id: "status",
			header: t("colStatus"),
			cell: ({ row }) => statusLabel(row.original.status),
		},
		{
			id: "actions",
			header: () => <span className="sr-only">{t("actions")}</span>,
			cell: ({ row }) => (
				<div className="flex flex-wrap justify-end gap-1">
					{!row.original.student_id && (
						<Button
							type="button"
							variant="secondary"
							size="sm"
							disabled={saving}
							onClick={() => void assignStudentId(row.original.id)}
						>
							{t("assignStudentId")}
						</Button>
					)}
					<Button type="button" variant="outline" size="sm" onClick={() => startEdit(row.original)}>
						{t("edit")}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!row.original.profile_id}
						title={row.original.profile_id ? undefined : t("sendNoticeNeedAccount")}
						onClick={() => startNotice(row.original)}
					>
						{t("sendNotice")}
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-4">
			<Card className="border-border/60 bg-card/35">
				<CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
					<div className="min-w-0 flex-1 space-y-2">
						<Label htmlFor="stu-search">{t("searchPlaceholder")}</Label>
						<Input
							id="stu-search"
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={t("searchPlaceholder")}
							className="h-10"
						/>
					</div>
					<div className="w-full space-y-2 sm:w-48">
						<Label htmlFor="stu-status">{t("filterStatus")}</Label>
						<select
							id="stu-status"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
							className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
						>
							<option value="">{t("filterAll")}</option>
							{STATUSES.map((s) => (
								<option key={s} value={s}>
									{t(`status_${s}` as "status_registered")}
								</option>
							))}
						</select>
					</div>
				</CardContent>
			</Card>

			{toast && (
				<p
					className={cn(
						"text-sm",
						toast === t("saved") || toast === t("noticeSent")
							? "text-emerald-600 dark:text-emerald-400"
							: "text-destructive",
					)}
				>
					{toast}
				</p>
			)}
			{error && <p className="text-destructive text-sm">{error}</p>}

			<DataTable
				columns={columns}
				data={loading ? [] : students}
				pageSize={15}
				toolbar={undefined}
				empty={loading ? "..." : t("empty")}
			/>

			<Dialog
				open={editingRow !== null && edit !== null}
				onOpenChange={(o) => {
					if (!o) {
						setEditingRow(null);
						setEdit(null);
					}
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
					<DialogHeader>
						<DialogTitle>{t("editRegistration")}</DialogTitle>
					</DialogHeader>
					{edit && editingRow ? (
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="e-real">{t("colRealName")}</Label>
								<Input
									id="e-real"
									value={edit.real_name}
									onChange={(e) => setEdit({ ...edit, real_name: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="e-nick">{t("colNickname")}</Label>
								<Input
									id="e-nick"
									value={edit.nickname}
									onChange={(e) => setEdit({ ...edit, nickname: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="e-email">{t("colEmail")}</Label>
								<Input
									id="e-email"
									type="email"
									value={edit.email}
									onChange={(e) => setEdit({ ...edit, email: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="e-phone">{t("colPhone")}</Label>
								<Input
									id="e-phone"
									value={edit.phone}
									onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="e-sid">{t("colStudentId")}</Label>
								<Input
									id="e-sid"
									value={edit.student_id}
									onChange={(e) => setEdit({ ...edit, student_id: e.target.value })}
									className="h-10 font-mono text-xs"
								/>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="e-addr">{t("address")}</Label>
								<Input
									id="e-addr"
									value={edit.address}
									onChange={(e) => setEdit({ ...edit, address: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="e-emg">{t("colEmergency")}</Label>
								<Input
									id="e-emg"
									value={edit.emergency_phone}
									onChange={(e) => setEdit({ ...edit, emergency_phone: e.target.value })}
									className="h-10"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="e-st">{t("colStatus")}</Label>
								<select
									id="e-st"
									value={edit.status}
									onChange={(e) =>
										setEdit({
											...edit,
											status: e.target.value as (typeof STATUSES)[number],
										})
									}
									className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm dark:bg-input/30"
								>
									{STATUSES.map((s) => (
										<option key={s} value={s}>
											{t(`status_${s}` as "status_registered")}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="e-goals">{t("learningGoals")}</Label>
								<Textarea
									id="e-goals"
									value={edit.learning_goals}
									onChange={(e) => setEdit({ ...edit, learning_goals: e.target.value })}
									className="min-h-[80px]"
								/>
							</div>
						</div>
					) : null}
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={saving}
							onClick={() => {
								setEditingRow(null);
								setEdit(null);
							}}
						>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							disabled={saving || !editingRow}
							onClick={() => editingRow && void saveEdit(editingRow.id)}
						>
							{t("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={noticeTarget !== null}
				onOpenChange={(o) => {
					if (!o) setNoticeTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-lg" showCloseButton>
					<DialogHeader>
						<DialogTitle>
							{t("sendNotice")}
							{noticeTarget ? ` · ${noticeTarget.nickname}` : ""}
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="space-y-2">
							<Label htmlFor="notice-title">{t("sendNoticeTitle")}</Label>
							<Input
								id="notice-title"
								value={noticeTitle}
								onChange={(e) => setNoticeTitle(e.target.value)}
								maxLength={80}
								className="h-10"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="notice-body">{t("sendNoticeBody")}</Label>
							<Textarea
								id="notice-body"
								value={noticeBody}
								onChange={(e) => setNoticeBody(e.target.value)}
								maxLength={2000}
								className="min-h-[120px]"
							/>
						</div>
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={sendingNotice} onClick={() => setNoticeTarget(null)}>
							{t("cancel")}
						</Button>
						<Button type="button" disabled={sendingNotice} onClick={() => void sendNotice()}>
							{t("sendNotice")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
