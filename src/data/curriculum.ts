/**
 * 学段专属内容。
 *
 * 这里的 promptAddendum 会被追加到用户在设置页里的系统提示词之后（见
 * aiStreamService.resolveSystemPrompt），只负责补充「知识范围 / 解法风格 /
 * 该学段常用的 GeoGebra 画法」，不重复定义输出格式——输出格式仍由用户的
 * 基础提示词（【RESULT】 那一段）决定，避免两边打架。
 *
 * 指令清单只收录能确定存在的 GeoGebra 命令；拿不准的一律不写，
 * 否则模型会照着生成、然后在画板上整片报错。
 */

export type StageId = 'general' | 'highschool' | 'university';

export interface ProblemTemplate {
  id: string;
  label: string;
  /** 点击后填入题目输入框的骨架文本 */
  text: string;
}

export interface CurriculumStage {
  id: StageId;
  label: string;
  description: string;
  /** 追加到系统提示词后的学段指令；通用学段为空表示不追加 */
  promptAddendum: string;
  templates: ProblemTemplate[];
}

const HIGH_SCHOOL_PROMPT = `
——————————
【学段设定：高中数学】
本题按中国高中数学课程标准作答，请严格遵守以下约定。

〔知识范围〕
只使用高中范围内的工具：集合与常用逻辑用语、函数与基本初等函数、导数及其应用、
三角函数与解三角形、平面向量、数列、不等式、立体几何（线面位置关系、空间角与距离、
表面积与体积）、解析几何（直线与圆、椭圆/双曲线/抛物线）、概率与统计、复数。
不要使用大学工具（多元微积分、线性代数矩阵理论、级数收敛判别、微分方程通解等），
即使它们更快；确实绕不开时，必须额外补一份高中方法的完整解答。

〔解法结构〕
1.【常规解法】优先给出课堂上的标准做法：作辅助线、用定理（正弦/余弦定理、中位线、
   三垂线、等积法、韦达定理、基本不等式等），写清每一步依据。
2.【建系暴力法】只要题目有坐标系或可以建系，必须再补一份纯计算的解析解法，
   常用武器：两点间距离公式、点到直线距离公式 d=|Ax₀+By₀+C|/√(A²+B²)、
   中点/定比分点公式、鞋带公式求面积、向量数量积判垂直与求夹角、
   立体几何用法向量求线面角与二面角。
3. 涉及最值时说明取等条件；涉及动点时用参数（如 t）表示轨迹并给出参数范围。

〔作答规范〕
- 结果一律保留精确值：根式、分数、π，不要写成小数（必要时可在括号里附近似值）。
- 角度按题目语境统一用弧度或角度制，不要中途混用。
- 需要分类讨论时把讨论的依据和分界点写清楚。

〔画板约定〕
- 平面问题用 MODE: 2D；立体几何用 MODE: 3D。
- 动点务必用滑块参数化：t = Slider(0, 1, 0.01)，动点写成 P = (f(t), g(t))。
- 常用命令：Point、Segment、Line、Ray、Polygon、Circle、Ellipse、Hyperbola、
  Parabola、Midpoint、Intersect、Distance、Angle、PerpendicularLine、
  ParallelLine、Tangent、Slider；立体几何再加 Pyramid、Prism、Cube、Sphere、Plane。
`.trim();

const UNIVERSITY_PROMPT = `
——————————
【学段设定：大学数学】
本题按国内高校本科数学课程（高等数学 / 数学分析、线性代数、概率论与数理统计等）作答。

〔知识范围〕
可自由使用：极限与连续、一元及多元微分学、不定/定积分、重积分、曲线与曲面积分、
无穷级数与幂级数、常微分方程、空间解析几何与向量代数、矩阵与行列式、线性方程组、
特征值与特征向量、二次型、随机变量与分布、大数定律与中心极限定理、参数估计与假设检验、
复变函数基础。

〔解法结构〕
1. 先说明使用的定理及其成立条件（连续性、可微性、一致收敛、正定性等），
   不能只写结论；条件不满足时要指出并改用别的方法。
2. 推导过程分步写清，关键变形（换元、分部、极坐标/柱坐标/球坐标变换、
   配方、初等行变换）要标明所用方法与变量替换关系。
3. 涉及级数/反常积分必须讨论收敛性；涉及极值必须验证驻点性质（Hessian 或二阶判别）；
   涉及积分换序必须说明依据。
4. 给出最终结果后，若存在简洁的几何或概率解释，用一两句话点出来。

〔作答规范〕
- 结果保留精确形式（根式、分数、π、e、Γ 等）。
- 向量与矩阵用规范记号；矩阵按行列写清楚维数。
- 涉及参数的结论要说明参数的取值范围。

〔画板约定〕
- 空间问题用 MODE: 3D，平面问题用 MODE: 2D。
- 常用命令：Curve（参数曲线，2D/3D 均可）、Surface（参数曲面）、
  Function/Derivative/Integral/IntegralBetween、SlopeField（一阶方程方向场）、
  Sum（级数部分和）、Vector、Plane、Sphere、Point、Segment、Slider、Intersect。
- 画曲面示例：s = Surface(u cos(v), u sin(v), u^2, u, 0, 2, v, 0, 2π)
- 画空间曲线示例：c = Curve(cos(t), sin(t), t, t, 0, 4π)
- 需要展示"随参数变化"的现象时，用 Slider 参数化并让相关对象依赖该滑块。
`.trim();

export const CURRICULUM_STAGES: CurriculumStage[] = [
  {
    id: 'general',
    label: '通用',
    description: '不限定学段，按题目自身难度作答',
    promptAddendum: '',
    templates: [],
  },
  {
    id: 'highschool',
    label: '高中',
    description: '限定课标范围，常规解法 + 建系暴力法双解',
    promptAddendum: HIGH_SCHOOL_PROMPT,
    templates: [
      {
        id: 'triangle',
        label: '解三角形',
        text: '在 △ABC 中，角 A、B、C 的对边分别为 a、b、c。已知 a = ____，b = ____，C = ____。\n求：(1) 边 c 的长；(2) △ABC 的面积。',
      },
      {
        id: 'conic',
        label: '圆锥曲线',
        text: '已知椭圆 C: x²/a² + y²/b² = 1 (a > b > 0) 的离心率为 ____，且经过点 ____。\n(1) 求椭圆 C 的方程；\n(2) 过点 ____ 的直线 l 与 C 交于 M、N 两点，求 △OMN 面积的最大值。',
      },
      {
        id: 'solid',
        label: '立体几何',
        text: '如图，在四棱锥 P-ABCD 中，底面 ABCD 为____，PA ⊥ 平面 ABCD，PA = ____，AB = ____。\n(1) 证明：____ ⊥ ____；\n(2) 求二面角 ____ 的大小。',
      },
      {
        id: 'extremum',
        label: '函数最值',
        text: '已知函数 f(x) = ____，x ∈ ____。\n(1) 求 f(x) 的单调区间；\n(2) 求 f(x) 的最大值与最小值，并说明取等条件。',
      },
      {
        id: 'sequence',
        label: '数列',
        text: '已知数列 {aₙ} 满足 a₁ = ____，且 ____。\n(1) 求数列 {aₙ} 的通项公式；\n(2) 设 bₙ = ____，求数列 {bₙ} 的前 n 项和 Sₙ。',
      },
      {
        id: 'moving-point',
        label: '动点最值',
        text: '在平面直角坐标系中，已知定点 A(____, ____)，点 P 在____上运动。\n求 |PA| + |PB| 的最小值（或线段 ____ 长度的最小值），并求出取到最小值时点 P 的坐标。',
      },
      {
        id: 'probability',
        label: '概率统计',
        text: '某试验中，____。设随机变量 X 表示____。\n(1) 求 X 的分布列；\n(2) 求 X 的数学期望 E(X) 与方差 D(X)。',
      },
    ],
  },
  {
    id: 'university',
    label: '大学',
    description: '高数 / 线代 / 概率论，强调定理条件与严格推导',
    promptAddendum: UNIVERSITY_PROMPT,
    templates: [
      {
        id: 'limit',
        label: '极限与级数',
        text: '(1) 求极限 lim_{x→____} ____；\n(2) 判别级数 ∑_{n=1}^{∞} ____ 的敛散性，并说明所用判别法及其条件。',
      },
      {
        id: 'multivar',
        label: '多元微分',
        text: '设 z = f(x, y) = ____。\n(1) 求 ∂z/∂x、∂z/∂y 及全微分 dz；\n(2) 求 f 在约束 ____ 下的极值，并验证驻点性质。',
      },
      {
        id: 'integral',
        label: '重积分',
        text: '计算二重积分 ∬_D ____ dxdy，其中区域 D 由 ____ 围成。\n请写出积分区域的示意、选用的坐标系及换元的雅可比行列式。',
      },
      {
        id: 'ode',
        label: '微分方程',
        text: '求解微分方程 ____，满足初始条件 ____。\n请说明方程类型（可分离变量 / 一阶线性 / 齐次 / 常系数线性等）及对应解法。',
      },
      {
        id: 'linear-algebra',
        label: '线性代数',
        text: '已知矩阵 A = ____。\n(1) 求 A 的特征值与特征向量；\n(2) 判断 A 能否对角化，若能则求可逆矩阵 P 使 P⁻¹AP 为对角矩阵。',
      },
      {
        id: 'space-geometry',
        label: '空间解析几何',
        text: '已知空间中直线 l: ____，平面 π: ____。\n(1) 求 l 与 π 的位置关系及交点（若存在）；\n(2) 求点 ____ 到平面 π 的距离。',
      },
      {
        id: 'probability',
        label: '概率统计',
        text: '设随机变量 X 服从 ____ 分布。\n(1) 写出其概率密度（分布律）并求 E(X)、D(X)；\n(2) ____。',
      },
    ],
  },
];

export const DEFAULT_STAGE: StageId = 'general';

export function getStage(id: string | null | undefined): CurriculumStage {
  return CURRICULUM_STAGES.find(s => s.id === id) ?? CURRICULUM_STAGES[0];
}
