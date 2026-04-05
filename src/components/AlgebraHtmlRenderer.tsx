interface Props {
  content: string;
}

export default function AlgebraHtmlRenderer({ content }: Props) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: '40px',
      background: 'var(--panel-bg)',
      overflowY: 'auto',
      borderRadius: '16px',
      lineHeight: '1.8',
      color: 'var(--text-primary)',
      wordBreak: 'break-word'
    }}>
      <h2 style={{ marginBottom: '24px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        纯代数 / 解析过程视图
      </h2>
      <div 
         style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '1.05rem' }}
         dangerouslySetInnerHTML={{ __html: content || '<p style="color: var(--text-secondary)">等待生成代数解析内容...</p>' }} 
      />
    </div>
  );
}
