"use client";
import React from 'react';

const Users = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>👥</span>;
const Clock = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⏱</span>;
const Server = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>🖥️</span>;
const Activity = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⚡</span>;

interface StatsProps {
  guildCount: number;
  totalRecruitments: number;
  activeRecruitments: number;
  averageElapsedMinutes: number;
}

export function AdminStats({ guildCount, totalRecruitments, activeRecruitments, averageElapsedMinutes }: StatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center">
          <div className="p-3 bg-indigo-600 rounded-lg"><Server className="w-6 h-6 text-white" /></div>
          <div className="ml-4"><p className="text-gray-400 text-sm">導入サーバー数</p><p className="text-2xl font-bold text-white">{guildCount}</p></div>
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center">
          <div className="p-3 bg-blue-600 rounded-lg"><Activity className="w-6 h-6 text-white" /></div>
          <div className="ml-4"><p className="text-gray-400 text-sm">総募集数</p><p className="text-2xl font-bold text-white">{totalRecruitments}</p></div>
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center">
          <div className="p-3 bg-green-600 rounded-lg"><Users className="w-6 h-6 text-white" /></div>
          <div className="ml-4"><p className="text-gray-400 text-sm">アクティブ募集</p><p className="text-2xl font-bold text-white">{activeRecruitments}</p></div>
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center">
          <div className="p-3 bg-purple-600 rounded-lg"><Clock className="w-6 h-6 text-white" /></div>
          <div className="ml-4">
            <p className="text-gray-400 text-sm">平均経過時間</p>
            <p className="text-2xl font-bold text-white">
              {averageElapsedMinutes > 60 ? `${Math.floor(averageElapsedMinutes / 60)}時間${averageElapsedMinutes % 60}分` : `${averageElapsedMinutes}分`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
