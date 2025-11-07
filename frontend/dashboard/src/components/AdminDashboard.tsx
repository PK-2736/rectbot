"use client";
import React from 'react';
import type { AdminDashboardProps, RecruitmentData } from './admin/types';
import { useRecruitments } from './admin/useRecruitments';
import { AdminDashboardHeader } from './admin/AdminDashboardHeader';
import { AdminStats } from './admin/AdminStats';
import { RecruitmentTable } from './admin/RecruitmentTable';

export default function AdminDashboard({ initialData }: AdminDashboardProps) {
  const {
    recruitments,
    guildCount,
    lastUpdate,
    isLoading,
    isCleaningUp,
    fetchError,
    performCleanup,
  } = useRecruitments(initialData);

  const activeRecruitments = recruitments.filter((r: RecruitmentData) => r.status === 'recruiting').length;
  const totalRecruitments = recruitments.length;

  const averageElapsedMinutes = (() => {
    const activeRecs = recruitments.filter((r: RecruitmentData) => r.status === 'recruiting');
    if (activeRecs.length === 0) return 0;
    const totalMinutes = activeRecs.reduce((sum: number, rec: RecruitmentData) => {
      const elapsed = Date.now() - new Date(rec.start_time).getTime();
      return sum + Math.floor(elapsed / (1000 * 60));
    }, 0);
    return Math.floor(totalMinutes / activeRecs.length);
  })();

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {fetchError && (
        <div className="mb-6 p-4 bg-red-700 text-white rounded">
          <strong>データ取得エラー:</strong>
          <div className="mt-1 text-sm">{fetchError}</div>
        </div>
      )}

      <AdminDashboardHeader
        isCleaningUp={isCleaningUp}
        onCleanup={performCleanup}
        isLoading={isLoading}
        lastUpdate={lastUpdate}
      />

      <AdminStats
        guildCount={guildCount}
        totalRecruitments={totalRecruitments}
        activeRecruitments={activeRecruitments}
        averageElapsedMinutes={averageElapsedMinutes}
      />

      <RecruitmentTable recruitments={recruitments} />
    </div>
  );
}