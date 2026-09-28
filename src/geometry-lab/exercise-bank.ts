import type { GeometryExercise } from './exercises.js';

/**
 * The exercise bank, as data.
 *
 * <p>Migrated from `GEOMETRY_LAB_EXERCISES.md` without rewriting the teaching:
 * the goals, tasks, questions and extensions are the ones a teacher already
 * had. What is added is the four things prose could not carry - the facts a
 * finished figure establishes, the tools in scope, a hint ladder, and a mark
 * scheme.
 *
 * <p><b>Two of those additions changed the content, and deliberately.</b>
 *
 * <p>First, several tasks now say which letters to use. "Mark the midpoint of
 * each side" cannot be marked automatically, because a fact is named for the
 * points it is about and nothing said what they were called. Naming them is
 * how the exercise becomes checkable, and it is a good instruction anyway - a
 * child who labels their figure can talk about it.
 *
 * <p>Second, <b>most exercises have no target and that is not an oversight</b>.
 * "Build a shape garden" is a real activity and there is no invariant that says
 * a garden is finished; "which dimension affects volume most when doubled" is a
 * question about a measurement, not a relation between objects. Inventing facts
 * to make those look markable would make marking wrong rather than wide. The
 * ones with a target are the ones that are really about establishing a
 * relation, which is what this instrument can vouch for, and every 3D exercise
 * is open because the 3D vocabulary is task 4.3b and does not exist yet.
 */
export const GEOMETRY_EXERCISE_BANK: readonly GeometryExercise[] = [
  /* ---------------------------------------------------------------------- */
  /* Level 1: ages 7-10                                                     */
  /* ---------------------------------------------------------------------- */
  {
    id: 'shape-garden',
    title: 'Build a shape garden',
    level: 'ages-7-10',
    goal: 'Recognize and construct basic shapes.',
    view: '2d',
    task: [
      'Create a square flower bed.',
      'Add a triangular roof-shaped greenhouse.',
      'Add three circular ponds.',
      'Label every shape.',
      'Use different colors for each object.',
    ],
    questions: [
      'How many sides does each shape have?',
      'Which shapes have equal sides?',
      'Which shapes have corners?',
    ],
    extension: 'Create one new shape and write its name next to it.',
    tools: ['point', 'segment', 'polygon', 'circle', 'label', 'color'],
    target: [],
    hints: [
      { rung: 1, text: 'A flower bed is a polygon. Start with four points and join them up.' },
      { rung: 2, text: 'A pond is a circle: pick a centre, then a point on the edge.' },
      { rung: 3, text: 'Use the label tool on each shape so you can talk about it afterwards.' },
    ],
    rubric: [
      { id: 'shapes', description: 'A square, a triangle and three circles are present.', requires: [], points: 3 },
      { id: 'labels', description: 'Every shape is labelled.', requires: [], points: 1 },
      { id: 'colour', description: 'Objects are distinguished by colour.', requires: [], points: 1 },
    ],
  },
  {
    id: 'treasure-map',
    title: 'Treasure map coordinates',
    level: 'ages-7-10',
    goal: 'Learn coordinate placement.',
    view: '2d',
    task: [
      'Place points at (0, 0), (3, 0), (3, 2), (1, 4) and (-2, 2).',
      'Connect the points in order.',
      'Label the points A, B, C, D and E.',
      'Mark the treasure at point (1, 2).',
    ],
    questions: [
      'Which point is farthest to the right?',
      'Which point is highest?',
      'What path would you take from (0, 0) to the treasure?',
    ],
    extension: 'Add two more treasure points and write their coordinates.',
    tools: ['point', 'segment', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'The first number is how far across, the second is how far up.' },
      { rung: 2, text: 'A negative first number means to the left of the middle.' },
      { rung: 3, text: 'Join the points in the order you placed them, then close the shape.' },
    ],
    rubric: [
      { id: 'points', description: 'All five points are at the stated coordinates.', requires: [], points: 3 },
      { id: 'path', description: 'The points are joined in order.', requires: [], points: 1 },
      { id: 'labels', description: 'Points are labelled A to E.', requires: [], points: 1 },
    ],
  },
  {
    id: 'angle-hunt',
    title: 'Angle hunt',
    level: 'ages-7-10',
    goal: 'Identify right, acute, and obtuse angles.',
    view: '2d',
    task: [
      'Draw three different angles.',
      'Mark each angle.',
      'Try to create one angle smaller than 90 degrees, one exactly 90 degrees, and one larger.',
    ],
    questions: ['Which angle is acute?', 'Which angle is right?', 'Which angle is obtuse?'],
    extension: 'Build a simple house drawing and mark at least four angles.',
    tools: ['point', 'segment', 'angle', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'An angle needs three points: an arm, the corner, and the other arm.' },
      { rung: 2, text: 'Measure each angle and read the number before you decide what to call it.' },
      { rung: 3, text: 'A right angle is exactly 90. Anything less is acute, anything more is obtuse.' },
    ],
    rubric: [
      { id: 'three', description: 'Three angles are marked.', requires: [], points: 2 },
      { id: 'kinds', description: 'One acute, one right and one obtuse.', requires: [], points: 3 },
    ],
  },
  {
    id: 'symmetry-face',
    title: 'Symmetry face',
    level: 'ages-7-10',
    goal: 'Explore mirror symmetry.',
    view: '2d',
    task: [
      'Draw a vertical line through the centre of the canvas.',
      'Create one half of a face using points, segments and circles.',
      'Reflect the objects across the line to make the other side.',
      'Check whether matching points are the same distance from the centre line.',
    ],
    questions: ['What makes the face symmetrical?', 'Which objects are not perfectly symmetrical?'],
    extension: 'Add glasses, ears or a hat while keeping the drawing symmetrical.',
    tools: ['point', 'segment', 'circle', 'stamp', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'Every part of the face needs a partner the same distance from the line.' },
      { rung: 2, text: 'Reflecting is safer than copying by eye - the mirror does the measuring.' },
      { rung: 3, text: 'Drag the mirror line and watch: a reflected face follows, a copied one does not.' },
    ],
    rubric: [
      { id: 'mirror', description: 'A mirror line is drawn.', requires: [], points: 1 },
      { id: 'halves', description: 'Both halves of the face are present and match.', requires: [], points: 3 },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Level 2: ages 10-13                                                    */
  /* ---------------------------------------------------------------------- */
  {
    id: 'triangle-detective',
    title: 'Triangle detective',
    level: 'ages-10-13',
    goal: 'Classify triangles by sides and angles.',
    view: '2d',
    task: [
      'Construct an isosceles triangle and label its corners A, B and C, with AB and AC the equal sides.',
      'Draw the three sides as segments.',
      'Measure all three side lengths.',
      'Measure all three angles.',
      'Add a label saying what kind of triangle it is.',
    ],
    questions: [
      'What side lengths prove a triangle is isosceles?',
      'What angles do you observe in an equilateral triangle?',
      'Can a scalene triangle also be obtuse?',
    ],
    extension: 'Create a right triangle and verify the right angle.',
    tools: ['point', 'segment', 'polygon', 'angle', 'label'],
    target: ['equal-segments:AB,AC'],
    hints: [
      { rung: 1, text: 'Isosceles means two sides the same. Which two did you mean to be equal?', forInvariant: 'equal-segments:AB,AC' },
      { rung: 2, text: 'Measure AB and AC and compare the numbers.', forInvariant: 'equal-segments:AB,AC' },
      { rung: 3, text: 'Draw a circle centred on A through B: any point on it is the same distance from A, so put C there.', forInvariant: 'equal-segments:AB,AC' },
      { rung: 4, text: 'Now measure the two angles at B and at C. What do you notice?' },
    ],
    rubric: [
      { id: 'isosceles', description: 'Two sides are equal.', requires: ['equal-segments:AB,AC'], points: 3 },
      { id: 'measured', description: 'Sides and angles are measured.', requires: [], points: 2 },
    ],
    prerequisites: ['angle-hunt'],
  },
  {
    id: 'quadrilateral-sorting',
    title: 'Quadrilateral sorting',
    level: 'ages-10-13',
    goal: 'Compare rectangles, squares, parallelograms and trapezoids.',
    view: '2d',
    task: [
      'Create a rectangle and label its corners A, B, C and D in order round the shape.',
      'Draw the four sides as segments.',
      'Mark the parallel sides using colour or labels.',
      'Measure at least one angle.',
      'Write a short label explaining what kind of quadrilateral it is.',
    ],
    questions: [
      'Which shapes have four right angles?',
      'Which shapes have opposite sides parallel?',
      'Is every square a rectangle? Explain using your construction.',
    ],
    extension: 'Create a quadrilateral that does not fit any of the named types.',
    tools: ['point', 'segment', 'polygon', 'parallel', 'perpendicular', 'angle', 'label'],
    target: ['parallel:AB,CD', 'parallel:AD,BC', 'right-angle:ABC'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'Opposite sides of a rectangle never meet, however far you extend them.', forInvariant: 'parallel:AB,CD' },
      { rung: 2, text: 'Use the parallel tool through D rather than placing the last corner by eye.', forInvariant: 'parallel:AB,CD' },
      { rung: 3, text: 'A rectangle also needs square corners. Is the corner at B exactly 90 degrees?', forInvariant: 'right-angle:ABC' },
      { rung: 4, text: 'Build the side BC with the perpendicular tool on AB through B.', forInvariant: 'right-angle:ABC' },
    ],
    rubric: [
      { id: 'parallel', description: 'Both pairs of opposite sides are parallel.', requires: ['parallel:AB,CD', 'parallel:AD,BC'], points: 2 },
      { id: 'right', description: 'The corners are right angles.', requires: ['right-angle:ABC'], points: 2 },
      { id: 'explained', description: 'The shape is named and explained.', requires: [], points: 1 },
    ],
    prerequisites: ['triangle-detective'],
  },
  {
    id: 'circle-challenge',
    title: 'Circle challenge',
    level: 'ages-10-13',
    goal: 'Understand radius, diameter, chord and tangent.',
    view: '2d',
    task: [
      'Draw a circle with centre O through a point P.',
      'Add the point Q diametrically opposite P, so that P, O and Q lie on one line.',
      'Add a chord that is not a diameter, from P to a third point R on the circle.',
      'Construct a tangent to the circle at P and label its far end T.',
    ],
    questions: [
      'How is a diameter related to a radius?',
      'Does the chord pass through the centre?',
      'What angle should a tangent make with the radius at the tangent point?',
    ],
    extension: 'Create two tangent lines from one outside point.',
    tools: ['point', 'circle', 'segment', 'perpendicular', 'label'],
    target: ['point-on-circle:Q,circle(O)', 'collinear:O,P,Q', 'point-on-circle:R,circle(O)'],
    hints: [
      { rung: 1, text: 'Every point on the circle is the same distance from the centre.', forInvariant: 'point-on-circle:Q,circle(O)' },
      { rung: 2, text: 'A diameter goes through the centre, so O has to be between P and Q.', forInvariant: 'collinear:O,P,Q' },
      { rung: 3, text: 'Reflect P in O: that lands Q on the circle and in line, both at once.', forInvariant: 'collinear:O,P,Q' },
      { rung: 4, text: 'A tangent meets the radius at a right angle - build it perpendicular to OP at P.' },
    ],
    rubric: [
      { id: 'on-circle', description: 'The named points lie on the circle.', requires: ['point-on-circle:Q,circle(O)', 'point-on-circle:R,circle(O)'], points: 2 },
      { id: 'diameter', description: 'P, O and Q are in a line, so PQ is a diameter.', requires: ['collinear:O,P,Q'], points: 2 },
      { id: 'tangent', description: 'A tangent is constructed at P.', requires: [], points: 1 },
    ],
    prerequisites: ['triangle-detective'],
  },
  {
    id: 'area-and-perimeter',
    title: 'Area and perimeter lab',
    level: 'ages-10-13',
    goal: 'Compare area and perimeter.',
    view: '2d',
    task: [
      'Create two rectangles with the same area but different perimeter.',
      'Create two polygons with similar perimeter but different area.',
      'Record the measurements next to each shape.',
    ],
    questions: [
      'Can two shapes have the same area but different perimeter?',
      'Which shape uses space most efficiently?',
    ],
    extension: 'Design a playground with area between 20 and 30 square units.',
    tools: ['point', 'polygon', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'Try 2 by 6 and 3 by 4: both cover twelve squares.' },
      { rung: 2, text: 'Measure the area of each shape rather than counting by eye.' },
      { rung: 3, text: 'A long thin shape has a lot of edge for the space it covers.' },
    ],
    rubric: [
      { id: 'same-area', description: 'Two shapes with equal area and different perimeter.', requires: [], points: 2 },
      { id: 'same-perimeter', description: 'Two shapes with similar perimeter and different area.', requires: [], points: 2 },
      { id: 'recorded', description: 'Measurements are shown on the figure.', requires: [], points: 1 },
    ],
    prerequisites: ['quadrilateral-sorting'],
  },
  {
    id: 'construction-from-instructions',
    title: 'Construction from instructions',
    level: 'ages-10-13',
    goal: 'Follow precise geometric construction steps.',
    view: '2d',
    task: [
      'Place points A and B.',
      'Draw a circle centred at A through B.',
      'Draw a circle centred at B through A.',
      'Mark one intersection of the two circles as C.',
      'Join A, B and C with segments.',
    ],
    questions: ['What triangle did you create?', 'Why are all three sides equal?'],
    extension: 'Use the other circle intersection to create a rhombus.',
    tools: ['point', 'circle', 'segment', 'label'],
    target: ['equal-segments:AB,AC', 'equal-segments:AB,BC', 'equal-segments:AC,BC'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'C has to be on both circles at once. Where do they cross?', forInvariant: 'equal-segments:AB,AC' },
      { rung: 2, text: 'Use the intersection tool on the two circles rather than clicking near the crossing.', forInvariant: 'equal-segments:AB,AC' },
      { rung: 3, text: 'C is on the circle centred at A through B, so AC is the same as AB.', forInvariant: 'equal-segments:AB,AC' },
      { rung: 4, text: 'And C is on the circle centred at B through A, so BC is the same as AB too.', forInvariant: 'equal-segments:AB,BC' },
      { rung: 5, text: 'Now drag A. If the triangle stays equilateral, you constructed it rather than drew it.' },
    ],
    rubric: [
      { id: 'equilateral', description: 'All three sides are equal.', requires: ['equal-segments:AB,AC', 'equal-segments:AB,BC', 'equal-segments:AC,BC'], points: 4 },
      { id: 'explained', description: 'The student can say why the sides are equal.', requires: [], points: 2 },
    ],
    prerequisites: ['circle-challenge'],
  },

  /* ---------------------------------------------------------------------- */
  /* Level 3: ages 13-16                                                    */
  /* ---------------------------------------------------------------------- */
  {
    id: 'pythagorean-explorer',
    title: 'Pythagorean explorer',
    level: 'ages-13-16',
    goal: 'Discover the Pythagorean theorem visually.',
    view: '2d',
    task: [
      'Construct a right triangle with the right angle at A, legs of length 3 and 4, and label the other corners B and C.',
      'Measure the hypotenuse BC.',
      'Build a square on each side of the triangle.',
      'Measure or calculate the area of each square.',
    ],
    questions: [
      'What is the hypotenuse length?',
      'How do the two smaller square areas compare with the largest?',
      'Does a squared plus b squared equal c squared?',
    ],
    extension: 'Try another right triangle and test the theorem again.',
    tools: ['point', 'segment', 'polygon', 'perpendicular', 'angle', 'label'],
    target: ['right-angle:BAC'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'The right angle has to be exactly 90 degrees, not nearly.', forInvariant: 'right-angle:BAC' },
      { rung: 2, text: 'Build AC with the perpendicular tool on AB through A.', forInvariant: 'right-angle:BAC' },
      { rung: 3, text: 'Now measure BC. Then work out 3 squared plus 4 squared and compare.' },
    ],
    rubric: [
      { id: 'right', description: 'The triangle has a genuine right angle.', requires: ['right-angle:BAC'], points: 3 },
      { id: 'squares', description: 'A square is built on each side and its area found.', requires: [], points: 2 },
      { id: 'theorem', description: 'The student relates the three areas.', requires: [], points: 2 },
    ],
    prerequisites: ['construction-from-instructions'],
  },
  {
    id: 'parallel-transversals',
    title: 'Parallel lines and transversals',
    level: 'ages-13-16',
    goal: 'Explore corresponding, alternate and interior angles.',
    view: '2d',
    task: [
      'Draw a line through points A and B.',
      'Place a point C off the line and construct a line through C parallel to AB.',
      'Draw a transversal crossing both lines.',
      'Mark at least four angles where the transversal meets the lines.',
      'Compare their measures.',
    ],
    questions: [
      'Which angles are equal?',
      'Which angles add to 180 degrees?',
      'What changes when the transversal rotates?',
    ],
    extension: 'Create a diagram that shows why alternate interior angles are equal.',
    tools: ['point', 'segment', 'parallel', 'angle', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'Two lines drawn to look parallel usually are not. Use the parallel tool.' },
      { rung: 2, text: 'Mark the angle on each side of the transversal at both crossings.' },
      { rung: 3, text: 'Now rotate the transversal and watch which pairs stay equal.' },
    ],
    rubric: [
      { id: 'parallel', description: 'The second line is constructed parallel, not drawn by eye.', requires: [], points: 2 },
      { id: 'angles', description: 'At least four angles are marked and compared.', requires: [], points: 3 },
    ],
    prerequisites: ['quadrilateral-sorting'],
  },
  {
    id: 'triangle-centers',
    title: 'Triangle centers',
    level: 'ages-13-16',
    goal: 'Construct important triangle centers.',
    view: '2d',
    task: [
      'Construct a large triangle and label its corners A, B and C.',
      'Mark the midpoint of BC as P, of AC as Q, and of AB as R.',
      'Draw the medians AP, BQ and CR.',
      'Mark where they meet as G, the centroid.',
      'Construct the angle bisectors and compare their meeting point with G.',
    ],
    questions: [
      'Are the centroid and the angle-bisector meeting point usually the same?',
      'What happens in an equilateral triangle?',
    ],
    extension: 'Construct the circumcenter using perpendicular bisectors.',
    tools: ['point', 'segment', 'midpoint', 'bisector', 'label'],
    target: ['midpoint:P,BC', 'midpoint:Q,AC', 'midpoint:R,AB'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'A midpoint has to stay in the middle when the triangle moves.', forInvariant: 'midpoint:P,BC' },
      { rung: 2, text: 'Use the midpoint tool on the two ends of the side rather than placing a point halfway along.', forInvariant: 'midpoint:P,BC' },
      { rung: 3, text: 'Do the same for the other two sides.', forInvariant: 'midpoint:Q,AC' },
      { rung: 4, text: 'Now join each corner to the midpoint opposite it, and use the intersection tool for G.' },
    ],
    rubric: [
      { id: 'midpoints', description: 'All three midpoints are constructed.', requires: ['midpoint:P,BC', 'midpoint:Q,AC', 'midpoint:R,AB'], points: 3 },
      { id: 'centroid', description: 'The medians meet at a marked centroid.', requires: [], points: 2 },
      { id: 'compared', description: 'The centroid is compared with the angle-bisector point.', requires: [], points: 2 },
    ],
    prerequisites: ['construction-from-instructions'],
  },
  {
    id: 'similar-triangles',
    title: 'Similar triangles',
    level: 'ages-13-16',
    goal: 'Understand similarity and scale factor.',
    view: '2d',
    task: [
      'Create a triangle and label its corners A, B and C.',
      'Enlarge it from a centre by a scale factor of 2, and label the image D, E and F.',
      'Draw both triangles as polygons.',
      'Measure corresponding sides and corresponding angles.',
    ],
    questions: [
      'What happens to side lengths?',
      'What happens to angles?',
      'How does area change?',
    ],
    extension: 'Create a third triangle with scale factor 0.5.',
    tools: ['point', 'polygon', 'scale', 'angle', 'label'],
    target: ['similar:ABC,DEF'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'The copy has to be the same shape, not just bigger in one direction.', forInvariant: 'similar:ABC,DEF' },
      { rung: 2, text: 'Use the enlargement tool from a centre rather than moving the corners by hand.', forInvariant: 'similar:ABC,DEF' },
      { rung: 3, text: 'Measure a side of each and divide. Then do the same for another pair.' },
      { rung: 4, text: 'Now measure the angles in both. What did the enlargement leave alone?' },
    ],
    rubric: [
      { id: 'similar', description: 'The image really is the same shape.', requires: ['similar:ABC,DEF'], points: 3 },
      { id: 'measured', description: 'Corresponding sides and angles are measured.', requires: [], points: 2 },
      { id: 'area', description: 'The student says what happened to the area.', requires: [], points: 2 },
    ],
    prerequisites: ['triangle-centers'],
  },
  {
    id: 'transform-a-logo',
    title: 'Transform a logo',
    level: 'ages-13-16',
    goal: 'Practise translation, rotation, reflection and scaling.',
    view: '2d',
    task: [
      'Create a simple polygon logo.',
      'Translate one copy.',
      'Rotate one copy about a point.',
      'Reflect one copy in a line.',
      'Enlarge one copy.',
      'Label each transformation.',
    ],
    questions: [
      'Which transformations preserve size?',
      'Which transformations preserve angle measures?',
      'Which transformation changes orientation?',
    ],
    extension: 'Combine two transformations and describe the result.',
    tools: ['point', 'polygon', 'stamp', 'rotate', 'scale', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'A rotation needs a centre as well as an angle.' },
      { rung: 2, text: 'A reflection needs a mirror line - draw one before you use it.' },
      { rung: 3, text: 'Drag the original and watch: every copy should follow it.' },
    ],
    rubric: [
      { id: 'four', description: 'All four transformations are present.', requires: [], points: 4 },
      { id: 'labelled', description: 'Each image is labelled with its transformation.', requires: [], points: 1 },
      { id: 'described', description: 'The student says which preserve size and orientation.', requires: [], points: 2 },
    ],
    prerequisites: ['similar-triangles'],
  },

  /* ---------------------------------------------------------------------- */
  /* Level 4: ages 16+                                                      */
  /* ---------------------------------------------------------------------- */
  {
    id: 'equation-of-a-line',
    title: 'Equation of a line',
    level: 'ages-16-plus',
    goal: 'Connect algebra and geometry.',
    view: '2d',
    task: [
      'Draw the line y = 2x + 1.',
      'Place two points on the line.',
      'Draw the line y = -0.5x + 3.',
      'Find the intersection point.',
      'Verify it by solving the equations algebraically.',
    ],
    questions: [
      'What is the slope of each line?',
      'Are the lines perpendicular? Explain.',
      'What is the intersection coordinate?',
    ],
    extension: 'Create a line parallel to y = 2x + 1 through the point (0, -2).',
    tools: ['point', 'equation', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'The number in front of x is the slope.' },
      { rung: 2, text: 'Two lines are perpendicular when the slopes multiply to -1. Check 2 and -0.5.' },
      { rung: 3, text: 'Use the intersection tool rather than reading the crossing off the grid.' },
    ],
    rubric: [
      { id: 'lines', description: 'Both lines are drawn from their equations.', requires: [], points: 2 },
      { id: 'intersection', description: 'The intersection is constructed and named.', requires: [], points: 2 },
      { id: 'algebra', description: 'The answer is checked algebraically.', requires: [], points: 2 },
    ],
  },
  {
    id: 'circle-equation',
    title: 'Circle equation investigation',
    level: 'ages-16-plus',
    goal: 'Interpret circle equations.',
    view: '2d',
    task: [
      'Draw (x - 2)^2 + (y + 1)^2 = 9.',
      'Identify the centre and the radius.',
      'Add the centre point and label it.',
      'Add a point on the circle and measure the radius.',
    ],
    questions: [
      'What is the centre?',
      'Why is the radius 3?',
      'How would the equation change if the centre moved left by 4 units?',
    ],
    extension: 'Create a circle tangent to the x-axis and write its equation.',
    tools: ['point', 'circle', 'equation', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'The numbers subtracted from x and y are the centre - watch the signs.' },
      { rung: 2, text: 'The right-hand side is the radius squared, not the radius.' },
      { rung: 3, text: 'A circle touching the x-axis has a radius equal to the height of its centre.' },
    ],
    rubric: [
      { id: 'circle', description: 'The circle is drawn from its equation.', requires: [], points: 2 },
      { id: 'centre', description: 'The centre is identified and labelled.', requires: [], points: 2 },
      { id: 'radius', description: 'The radius is measured and explained.', requires: [], points: 2 },
    ],
    prerequisites: ['equation-of-a-line'],
  },
  {
    id: 'locus-design',
    title: 'Locus design',
    level: 'ages-16-plus',
    goal: 'Explore paths generated by points.',
    view: '2d',
    task: [
      'Create a parametric circle using x(t) = cos(t), y(t) = sin(t).',
      'Create an ellipse using x(t) = 3cos(t), y(t) = sin(t).',
      'Create a spiral-like curve if the expression parser supports it.',
      'Compare the shapes.',
    ],
    questions: [
      'Which parameter values trace a full circle?',
      'How does changing the coefficient of cos(t) affect the shape?',
      'Which curves are closed?',
    ],
    extension: 'Design a decorative pattern using at least three parametric curves.',
    tools: ['equation', 'point', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'A full turn is t from 0 to 2 pi.' },
      { rung: 2, text: 'The coefficient stretches the curve along that axis and leaves the other alone.' },
      { rung: 3, text: 'A closed curve returns to where it started - check the ends of your range.' },
    ],
    rubric: [
      { id: 'curves', description: 'A circle and an ellipse are plotted.', requires: [], points: 3 },
      { id: 'compared', description: 'The effect of the coefficient is described.', requires: [], points: 2 },
    ],
    prerequisites: ['circle-equation'],
  },
  {
    id: 'proof-by-construction',
    title: 'Proof by construction',
    level: 'ages-16-plus',
    goal: 'Use construction to support a geometric proof.',
    view: '2d',
    task: [
      'Construct triangle ABC.',
      'Mark the midpoint of AB as M.',
      'Mark the midpoint of AC as N.',
      'Join M and N with a segment, and join B and C with a segment.',
      'Measure MN and BC.',
      'Check whether MN is parallel to BC.',
    ],
    questions: [
      'What is the relationship between MN and BC?',
      'What theorem does this illustrate?',
      'How could you explain this without measurement?',
    ],
    extension: 'Move the triangle vertices and test whether the relationship stays true.',
    tools: ['point', 'segment', 'midpoint', 'label'],
    target: ['midpoint:M,AB', 'midpoint:N,AC', 'parallel:BC,MN'],
    requireConstruction: true,
    hints: [
      { rung: 1, text: 'M has to stay halfway along AB when you drag A. Does it?', forInvariant: 'midpoint:M,AB' },
      { rung: 2, text: 'Use the midpoint tool on A and B rather than placing a point that looks central.', forInvariant: 'midpoint:M,AB' },
      { rung: 3, text: 'Do the same for N on AC.', forInvariant: 'midpoint:N,AC' },
      { rung: 4, text: 'Join M to N and B to C, then measure both. What is the ratio?', forInvariant: 'parallel:BC,MN' },
      { rung: 5, text: 'Now drag every vertex in turn. A relationship that survives all of them is a theorem, not a coincidence.' },
    ],
    rubric: [
      { id: 'midpoints', description: 'Both midpoints are constructed.', requires: ['midpoint:M,AB', 'midpoint:N,AC'], points: 2 },
      { id: 'parallel', description: 'MN is parallel to BC.', requires: ['parallel:BC,MN'], points: 3 },
      { id: 'theorem', description: 'The student names the midsegment theorem and argues it.', requires: [], points: 3 },
    ],
    prerequisites: ['triangle-centers'],
  },

  /* ---------------------------------------------------------------------- */
  /* Three dimensions                                                       */
  /* ---------------------------------------------------------------------- */
  {
    id: 'build-and-measure-a-box',
    title: 'Build and measure a box',
    level: 'three-dimensional',
    goal: 'Understand cuboids, volume and surface area.',
    view: '3d',
    task: [
      'Create a cuboid with different width, depth and height.',
      'Measure its volume.',
      'Measure its surface area.',
      'Change one dimension and watch what happens.',
    ],
    questions: [
      'Which dimension affects volume the most when doubled?',
      'How does surface area change when the height changes?',
    ],
    extension: 'Design a box with volume exactly 24 cubic units.',
    tools: ['solid', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'Volume is width times depth times height.' },
      { rung: 2, text: 'Double one dimension and the volume doubles, whichever one you pick.' },
      { rung: 3, text: 'Surface area counts six faces in three matching pairs.' },
    ],
    rubric: [
      { id: 'built', description: 'A cuboid with three different dimensions.', requires: [], points: 2 },
      { id: 'measured', description: 'Volume and surface area are measured.', requires: [], points: 2 },
      { id: 'explored', description: 'The effect of changing a dimension is described.', requires: [], points: 2 },
    ],
  },
  {
    id: 'nets-of-solids',
    title: 'Nets of solids',
    level: 'three-dimensional',
    goal: 'Connect 3D solids to 2D nets.',
    view: '3d',
    task: [
      'Create a cube.',
      'Generate its unfolded net.',
      'Label corresponding faces.',
      'Predict which faces touch when it folds back up.',
    ],
    questions: ['How many faces does the cube have?', 'How many different cube nets can you make?'],
    extension: 'Create a rectangular prism net.',
    tools: ['solid', 'net', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'A cube has six faces, so the net has six squares.' },
      { rung: 2, text: 'Faces that share an edge in the net will fold together.' },
      { rung: 3, text: 'Opposite faces of the cube are never next to each other in the net.' },
    ],
    rubric: [
      { id: 'net', description: 'A net of the cube is produced.', requires: [], points: 3 },
      { id: 'labelled', description: 'Faces are labelled to match the solid.', requires: [], points: 2 },
    ],
    prerequisites: ['build-and-measure-a-box'],
  },
  {
    id: 'cross-section-slices',
    title: 'Cross-section slices',
    level: 'three-dimensional',
    goal: 'Visualize 2D slices through 3D solids.',
    view: '3d',
    task: [
      'Create a cube or a prism.',
      'Add a work plane through the solid.',
      'Create the cross-section.',
      'Change the angle of the plane and compare the slice.',
    ],
    questions: [
      'What shape is the cross-section?',
      'How does it change when the plane rotates?',
    ],
    extension: 'Try to create a triangular cross-section of a cube.',
    tools: ['solid', 'workPlane', 'crossSection'],
    target: [],
    hints: [
      { rung: 1, text: 'The plane has to actually pass through the solid to cut anything.' },
      { rung: 2, text: 'A plane parallel to a face gives you back that face shape.' },
      { rung: 3, text: 'Tilt the plane to cut across a corner and count the edges it crosses.' },
    ],
    rubric: [
      { id: 'section', description: 'A cross-section is produced.', requires: [], points: 3 },
      { id: 'varied', description: 'The plane is moved and the change described.', requires: [], points: 2 },
    ],
    prerequisites: ['build-and-measure-a-box'],
  },
  {
    id: 'dihedral-angle-explorer',
    title: 'Dihedral angle explorer',
    level: 'three-dimensional',
    goal: 'Measure angles between faces.',
    view: '3d',
    task: [
      'Create a cube.',
      'Select two adjacent faces.',
      'Measure the dihedral angle.',
      'Create a pyramid and measure the angles between its faces.',
    ],
    questions: [
      'What is the dihedral angle between adjacent cube faces?',
      'Are all the pyramid face angles the same?',
    ],
    extension: 'Compare a cube, a triangular prism and a pyramid.',
    tools: ['solid', 'angle', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'A dihedral angle is between two faces, so you need to pick two.' },
      { rung: 2, text: 'Adjacent faces of a cube meet along an edge at a square corner.' },
      { rung: 3, text: 'A pyramid has a base and slanted sides - are those two kinds of meeting the same?' },
    ],
    rubric: [
      { id: 'cube', description: 'The cube dihedral angle is measured.', requires: [], points: 2 },
      { id: 'pyramid', description: 'Pyramid face angles are measured and compared.', requires: [], points: 3 },
    ],
    prerequisites: ['build-and-measure-a-box'],
  },

  /* ---------------------------------------------------------------------- */
  /* Team and classroom                                                     */
  /* ---------------------------------------------------------------------- */
  {
    id: 'partner-construction-challenge',
    title: 'Partner construction challenge',
    level: 'classroom',
    goal: 'Communicate geometric instructions precisely.',
    view: '2d',
    task: [
      'Student A creates a hidden target shape.',
      'Student A writes construction instructions only.',
      'Student B follows the instructions in the Lab.',
      'Both students compare the result with the target.',
    ],
    questions: [
      'Which instruction was most important?',
      'Which instruction was unclear?',
      'How can geometry language become more precise?',
    ],
    tools: ['point', 'segment', 'polygon', 'circle', 'midpoint', 'perpendicular', 'parallel', 'label'],
    target: [],
    hints: [
      { rung: 1, text: 'Name your points. An instruction about "the corner" could mean any of them.' },
      { rung: 2, text: 'Say which tool to use, not just what the result should look like.' },
      { rung: 3, text: 'Read your own instructions back as if you had never seen the shape.' },
    ],
    rubric: [
      { id: 'instructions', description: 'Instructions are precise enough to follow.', requires: [], points: 3 },
      { id: 'match', description: 'The copy matches the target.', requires: [], points: 2 },
      { id: 'reflection', description: 'Both students say what was unclear.', requires: [], points: 2 },
    ],
    prerequisites: ['construction-from-instructions'],
  },
  {
    id: 'teacher-review-snapshot',
    title: 'Teacher review snapshot',
    level: 'classroom',
    goal: 'Reflect on mathematical reasoning.',
    view: '2d',
    task: [
      'Complete one exercise from this pack.',
      'Add labels explaining each construction step.',
      'Submit a saved snapshot.',
      'Your teacher comments on one object and one measurement.',
      'Revise and resubmit.',
      'Write three sentences: what you constructed, what relationship you showed, and what changed after feedback.',
    ],
    questions: [
      'What did you construct?',
      'What measurement or relationship did you prove?',
      'What changed after feedback?',
    ],
    tools: ['label', 'select'],
    target: [],
    hints: [
      { rung: 1, text: 'Your construction protocol already lists the steps - start from that.' },
      { rung: 2, text: 'A relationship is something that stays true when you drag the figure.' },
      { rung: 3, text: 'Say what you changed and why, not only that you changed it.' },
    ],
    rubric: [
      { id: 'labels', description: 'Construction steps are explained.', requires: [], points: 2 },
      { id: 'relationship', description: 'A relationship is identified, not only a drawing.', requires: [], points: 3 },
      { id: 'revision', description: 'The work is revised after feedback.', requires: [], points: 2 },
    ],
    prerequisites: ['partner-construction-challenge'],
  },
];

/** The exercise with that id, or nothing. */
export function geometryExercise(id: string): GeometryExercise | undefined {
  return GEOMETRY_EXERCISE_BANK.find((exercise) => exercise.id === id);
}
