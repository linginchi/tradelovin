export interface ChannelPartner {
  id: string;
  userId: string;
  channelType: "kol" | "channel";
  channelName: string;
  channelId: string | null;
  platform: string | null;
  commissionRate: number;
  contactEmail: string | null;
  payoutInfo: Record<string, unknown> | null;
  status: "active" | "paused" | "terminated";
  totalEarned: number;
  totalPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionRecord {
  id: string;
  partnerId: string;
  referralId: string | null;
  studentUserId: string;
  paymentTransactionId: string | null;
  tuitionAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: "pending" | "locked" | "paid" | "cancelled";
  settlementMonth: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CommissionPayout {
  id: string;
  partnerId: string;
  settlementMonth: string;
  totalCommission: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export type PartnerStats = {
  monthEstimate: number;
  totalEarned: number;
  totalPaid: number;
  studentCount: number;
  pendingAmount: number;
};
