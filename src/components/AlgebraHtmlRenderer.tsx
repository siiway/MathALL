import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Props {
  content: string;
}

/**
 * 纯代数解析视图。
 *
 * 这里的内容来自 AI 流式输出或用户导入的 JSON 项目文件，之前用
 * dangerouslySetInnerHTML 直接注入，等于把任意 HTML/脚本喂给页面（导入他人的
 * .json 即可 XSS）；而且模型输出的是 Markdown + LaTeX，当作 HTML 渲染本身也不对。
 * 统一改走 ReactMarkdown（与右侧「AI 指令流」面板一致）。
 */
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
      <div className="markdown-body" style={{ fontSize: '1.05rem' }}>
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {content}
          </ReactMarkdown>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>等待生成代数解析内容...</p>
        )}
      </div>
    </div>
  );
}
