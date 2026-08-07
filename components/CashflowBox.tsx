import { formatVNDShort } from '@/lib/utils'

export interface ChannelFlow { opening: number; in: number; out: number; unpaid: number; advance: number; transfer: number; net: number }
export interface CashflowData { tk_cty: ChannelFlow; tk_cn: ChannelFlow; tm: ChannelFlow }

function Channel({ title, color, flow, netColor }: {
  title: string; color: string; flow: ChannelFlow; netColor: string
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-3">
      <p className={`text-[10px] font-bold ${color} uppercase tracking-wider mb-2.5`}>{title}</p>
      <div className="space-y-1.5">
        {flow.opening !== 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-500">Số dư đầu kỳ</span>
            <span className="text-[11px] text-gray-300 tabular-nums">{formatVNDShort(flow.opening)}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-gray-400">+ Thu vào</span>
          <span className="text-[11px] text-green-400 tabular-nums font-medium">{formatVNDShort(flow.in)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-gray-400">− Chi (đã trả)</span>
          <span className="text-[11px] text-red-400 tabular-nums font-medium">{formatVNDShort(flow.out)}</span>
        </div>
        {flow.advance !== 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">− Tạm ứng chưa hoàn</span>
            <span className="text-[11px] text-orange-400 tabular-nums font-medium">{formatVNDShort(flow.advance)}</span>
          </div>
        )}
        {flow.transfer !== 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">{flow.transfer >= 0 ? '+ Chuyển đến' : '− Chuyển đi'}</span>
            <span className={`text-[11px] tabular-nums font-medium ${flow.transfer >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatVNDShort(Math.abs(flow.transfer))}
            </span>
          </div>
        )}
        <div className="border-t border-gray-700 pt-1.5 flex justify-between items-center">
          <span className="text-[11px] text-gray-300 font-semibold">Còn lại</span>
          <span className={`text-sm font-black tabular-nums ${flow.net >= 0 ? netColor : 'text-red-400'}`}>
            {formatVNDShort(flow.net)}
          </span>
        </div>
        {flow.unpaid > 0 && (
          <p className="text-[9px] text-gray-500 pt-0.5">
            Nợ chưa trả: <span className="text-gray-400">{formatVNDShort(flow.unpaid)}</span> (chỉ báo, không trừ)
          </p>
        )}
      </div>
    </div>
  )
}

export default function CashflowBox({ cashflow }: { cashflow: CashflowData }) {
  const tong = cashflow.tk_cty.net + cashflow.tk_cn.net + cashflow.tm.net
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Dòng tiền thực tế</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Channel title="🏦 TK Công ty" color="text-blue-400"   flow={cashflow.tk_cty} netColor="text-blue-300" />
        <Channel title="💳 TK Cá nhân" color="text-purple-400" flow={cashflow.tk_cn}  netColor="text-purple-300" />
        <Channel title="💵 Tiền mặt"    color="text-amber-400"  flow={cashflow.tm}     netColor="text-amber-300" />
      </div>
      <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">Tổng còn lại (ước tính)</span>
        <span className={`text-lg font-black tabular-nums ${tong >= 0 ? 'text-white' : 'text-red-400'}`}>
          {formatVNDShort(tong)}
        </span>
      </div>
    </div>
  )
}
