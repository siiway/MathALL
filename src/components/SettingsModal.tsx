import { X, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(6px)'
    }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-color)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>配置与系统设置</h2>
          <button className="btn btn-outline" style={{ padding: '6px' }} onClick={onClose} title="关闭">
            <X size={20} />
          </button>
        </div>
        
        <div style={{ padding: '24px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
           <div>
             <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>大语言模型 API 连接</label>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
               配置您的底层 AI 服务商，应用产生的任何数据分析不会经过我们的服务器，确保您的安全。
             </p>
             <input type="text" className="input-field" placeholder="Base URL (例如 https://api.openai.com/v1)" style={{ marginBottom: '12px' }} />
             <input type="password" className="input-field" placeholder="API Key (sk-...)" />
           </div>

           <div>
             <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>系统级规则与指令 (System Prompt)</label>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                为了实现最强的数学教研能力，这里默认装载了基础的距离公式、鞋带公式、斜率条件等纯算规则约束。
             </p>
             <textarea 
                className="input-field" 
                style={{ minHeight: '160px', resize: 'vertical', fontSize: '0.9rem', lineHeight: '1.5' }} 
                defaultValue={"你是一位严谨顶尖的数学教研宗师。在回答用户问题时，请先流式返回4字题目标签，随后：\n1. 如果含有几何特征，你需要首先提供【常规辅助线几何解法】。\n2. 遇到有坐标系的几何题或可以建系的题目，你必须强制补充【解析暴力代数法】，利用比如两点距离计算、点到直线距离公式、鞋带面积公式等作纯计算推导。\n3. 最后转化为 GeoGebra 指令标准语法输出，以便我用 evalCommand 让画板执行。"} 
             />
           </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
             MathAll Project · 版本 v1.0.0
          </span>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button className="btn btn-outline" onClick={onClose}>取消</button>
             <button className="btn btn-primary" onClick={onClose}>
               <Save size={18} />
               保存设置
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
