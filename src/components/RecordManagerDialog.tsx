"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RecordItem,
  fetchRecords,
  createRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/sheetService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database, RefreshCw, Plus, Trash2, Edit2, Check, X } from "lucide-react";

export default function RecordManagerDialog() {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 등록 상태 (Create)
  const [name, setName] = useState("");
  const [finishtime, setFinishtime] = useState("");

  // 수정 상태 (Update)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editTime, setEditTime] = useState("");

  // 데이터 조회 (Read)
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecords();
      setRecords(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (open) {
      fetchRecords().then((data) => {
        if (!ignore) {
          setRecords(data);
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [open]);

  // 등록 핸들러 (Create)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("사용자 이름을 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      await createRecord({
        name: name.trim(),
        finishtime: finishtime.trim() || "-",
      });
      setName("");
      setFinishtime("");
      await loadRecords();
    } finally {
      setLoading(false);
    }
  };

  // 수정 시작
  const startEdit = (item: RecordItem) => {
    if (item.rowIndex) {
      setEditingRowIndex(item.rowIndex);
      setEditName(item.name);
      setEditTime(item.finishtime);
    }
  };

  // 수정 저장 (Update)
  const handleSaveEdit = async (item: RecordItem) => {
    if (!item.rowIndex) return;
    setLoading(true);
    try {
      await updateRecord({
        rowIndex: item.rowIndex,
        name: editName,
        finishtime: editTime,
      });
      setEditingRowIndex(null);
      await loadRecords();
    } finally {
      setLoading(false);
    }
  };

  // 삭제 (Delete)
  const handleDelete = async (item: RecordItem) => {
    if (!item.rowIndex) return;
    if (!confirm(`'${item.name}'의 기록을 시트에서 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      await deleteRecord(item.rowIndex);
      await loadRecords();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="bg-slate-900/90 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 gap-2 shadow-sm font-medium"
      >
        <Database className="w-4 h-4 text-emerald-400" />
        구글 시트 연동 (CRUD)
      </Button>

      <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-800 pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <DialogTitle className="text-xl font-bold text-white">
              구글 시트 데이터 관리 (CRUD)
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadRecords}
            disabled={loading}
            className="text-slate-400 hover:text-white h-8 px-2"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> 새로고침
          </Button>
        </DialogHeader>

        {/* 1. 신규 행 등록 (Create) */}
        <form
          onSubmit={handleCreate}
          className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 my-2 space-y-3"
        >
          <div className="text-sm font-semibold text-sky-400 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> 구글 시트에 행 추가 (timestamp / name / finishtime)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-name" className="text-xs text-slate-400">
                이름 (name)
              </Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 정성윤"
                className="mt-1 bg-slate-900 border-slate-700 text-sm text-white"
                required
              />
            </div>
            <div>
              <Label htmlFor="c-time" className="text-xs text-slate-400">
                완료 시간 (finishtime)
              </Label>
              <Input
                id="c-time"
                value={finishtime}
                onChange={(e) => setFinishtime(e.target.value)}
                placeholder="예: 01:25"
                className="mt-1 bg-slate-900 border-slate-700 text-sm text-white font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> 구글 시트에 즉시 등록
            </Button>
          </div>
        </form>

        {/* 2. 구글 시트 목록 (Read, Update, Delete) */}
        <div className="border border-slate-800 rounded-xl overflow-hidden mt-3">
          <Table>
            <TableHeader className="bg-slate-950/80">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="w-48 text-slate-400 text-xs">일시 (timestamp)</TableHead>
                <TableHead className="text-slate-400 text-xs">이름 (name)</TableHead>
                <TableHead className="w-32 text-slate-400 text-xs">완료 시간 (finishtime)</TableHead>
                <TableHead className="w-20 text-center text-slate-400 text-xs">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-500 text-sm">
                    {loading ? "구글 시트에서 데이터를 가져오는 중..." : "구글 시트에 등록된 행이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((item, idx) => {
                  const isEditing = editingRowIndex === item.rowIndex;

                  return (
                    <TableRow
                      key={item.rowIndex || idx}
                      className="border-slate-800 hover:bg-slate-800/40 text-xs"
                    >
                      <TableCell className="text-slate-400 font-mono">
                        {item.timestamp || "-"}
                      </TableCell>

                      <TableCell className="font-semibold text-slate-200">
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 text-xs bg-slate-950 border-slate-700"
                          />
                        ) : (
                          item.name
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-emerald-400 font-medium">
                        {isEditing ? (
                          <Input
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="h-7 text-xs bg-slate-950 border-slate-700 font-mono"
                          />
                        ) : (
                          item.finishtime || "-"
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveEdit(item)}
                              className="w-6 h-6 text-emerald-400 hover:bg-emerald-950"
                              title="저장"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingRowIndex(null)}
                              className="w-6 h-6 text-slate-400 hover:bg-slate-800"
                              title="취소"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => startEdit(item)}
                              className="w-6 h-6 text-slate-400 hover:text-white hover:bg-slate-800"
                              title="수정"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(item)}
                              className="w-6 h-6 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
