# Geometry Lab Exercise Bank

Classroom-ready geometry activities for children and teenagers using Klein Geometry Lab. The exercises are grouped by age and difficulty, but teachers can adapt the prompts up or down depending on the class.

> **This pack is also available as data.** `GEOMETRY_EXERCISE_BANK` in `src/geometry-lab/exercise-bank.ts` carries all twenty-four of these exercises as typed objects, with the four things prose cannot hold: the facts a finished figure has to establish, the tools in scope, a hint ladder that responds to what the student's figure is missing, and a mark scheme. Eight of them can be marked automatically; the rest are open activities and say so. Some tasks there name their points explicitly (`label the corners A, B and C`), because a fact is named for the points it is about. **Edit both when you change an exercise** — `tests/geometry-lab/exercises.test.mjs` checks the data, not this file.

## How To Use This Pack

- Use the 2D tools first for points, lines, polygons, circles, angle marks, measurements, transformations, and constructions.
- Move to 3D when students are comfortable with planes, solids, nets, volumes, and cross-sections.
- Ask students to save or export their work after each task: JSON for editing later, SVG/PNG/PDF for submissions.
- Encourage students to explain their construction steps, not only submit a finished drawing.

## Level 1: Ages 7-10

### 1. Build A Shape Garden

**Goal:** Recognize and construct basic shapes.

**Tools:** Point, segment, polygon, rectangle, square, circle, label, color.

**Task:**

1. Create a square flower bed.
2. Add a triangular roof-shaped greenhouse.
3. Add three circular ponds.
4. Label every shape.
5. Use different colors for each object.

**Questions:**

- How many sides does each shape have?
- Which shapes have equal sides?
- Which shapes have corners?

**Extension:** Create one new shape and write its name next to it.

### 2. Treasure Map Coordinates

**Goal:** Learn coordinate placement.

**Tools:** Point by coordinates, label, segment, grid.

**Task:**

1. Place points at `(0, 0)`, `(3, 0)`, `(3, 2)`, `(1, 4)`, and `(-2, 2)`.
2. Connect the points in order.
3. Label the points `A`, `B`, `C`, `D`, and `E`.
4. Mark the treasure at point `(1, 2)`.

**Questions:**

- Which point is farthest to the right?
- Which point is highest?
- What path would you take from `(0, 0)` to the treasure?

**Extension:** Add two more treasure points and write their coordinates.

### 3. Angle Hunt

**Goal:** Identify right, acute, and obtuse angles.

**Tools:** Segment, angle marker, measurement label.

**Task:**

1. Draw three different angles.
2. Mark each angle.
3. Try to create one angle smaller than `90°`, one exactly `90°`, and one larger than `90°`.

**Questions:**

- Which angle is acute?
- Which angle is right?
- Which angle is obtuse?

**Extension:** Build a simple house drawing and mark at least four angles.

### 4. Symmetry Face

**Goal:** Explore mirror symmetry.

**Tools:** Points, segments, circles, grid, reflection if available.

**Task:**

1. Draw a vertical line through the center of the canvas.
2. Create one half of a face using points, segments, and circles.
3. Mirror or manually copy the same objects to the other side.
4. Check whether matching points are the same distance from the center line.

**Questions:**

- What makes the face symmetrical?
- Which objects are not perfectly symmetrical?

**Extension:** Add glasses, ears, or a hat while keeping the drawing symmetrical.

## Level 2: Ages 10-13

### 5. Triangle Detective

**Goal:** Classify triangles by sides and angles.

**Tools:** Polygon, segment length measurement, angle measurement.

**Task:**

1. Construct three triangles: scalene, isosceles, and equilateral.
2. Measure all side lengths.
3. Measure all angles.
4. Label each triangle type.

**Questions:**

- What side lengths prove a triangle is isosceles?
- What angles do you observe in the equilateral triangle?
- Can a scalene triangle also be obtuse?

**Extension:** Create a right triangle and verify the right angle.

### 6. Quadrilateral Sorting

**Goal:** Compare rectangles, squares, parallelograms, and trapezoids.

**Tools:** Polygon, parallel line, perpendicular line, angle marker, measurement.

**Task:**

1. Create a square, rectangle, parallelogram, and trapezoid.
2. Mark parallel sides using color or labels.
3. Measure at least one angle in each shape.
4. Write a short label explaining the type of each quadrilateral.

**Questions:**

- Which shapes have four right angles?
- Which shapes have opposite sides parallel?
- Is every square a rectangle? Explain using your construction.

**Extension:** Create a quadrilateral that does not fit any of the named types.

### 7. Circle Challenge

**Goal:** Understand radius, diameter, chord, and tangent.

**Tools:** Circle, segment, tangent line, label, measurement.

**Task:**

1. Draw a circle with center `O`.
2. Add a radius from `O` to a point on the circle.
3. Add a diameter through the center.
4. Add a chord that is not a diameter.
5. Construct a tangent line at a point on the circle.

**Questions:**

- How is a diameter related to a radius?
- Does the chord pass through the center?
- What angle should a tangent make with the radius at the tangent point?

**Extension:** Create two tangent lines from one outside point.

### 8. Area And Perimeter Lab

**Goal:** Compare area and perimeter.

**Tools:** Polygon, rectangle, measurement labels.

**Task:**

1. Create two rectangles with the same area but different perimeter.
2. Create two polygons with similar perimeter but different area.
3. Record the measurements next to each shape.

**Questions:**

- Can two shapes have the same area but different perimeter?
- Which shape uses space most efficiently?

**Extension:** Design a playground with area between `20 u²` and `30 u²`.

### 9. Construction From Instructions

**Goal:** Follow precise geometric construction steps.

**Tools:** Point, circle, intersection, segment, polygon.

**Task:**

1. Place points `A` and `B`.
2. Draw a circle centered at `A` through `B`.
3. Draw a circle centered at `B` through `A`.
4. Mark one intersection point as `C`.
5. Connect `A`, `B`, and `C`.

**Questions:**

- What triangle did you create?
- Why are all three sides equal?

**Extension:** Use the other circle intersection to create a rhombus.

## Level 3: Ages 13-16

### 10. Pythagorean Explorer

**Goal:** Discover the Pythagorean theorem visually.

**Tools:** Right triangle, square, measurement, area labels.

**Task:**

1. Construct a right triangle with legs of length `3` and `4`.
2. Measure the hypotenuse.
3. Build a square on each side of the triangle.
4. Measure or calculate the area of each square.

**Questions:**

- What is the hypotenuse length?
- How do the two smaller square areas compare with the largest square area?
- Does `a² + b² = c²` hold?

**Extension:** Try another right triangle and test the theorem again.

### 11. Parallel Lines And Transversals

**Goal:** Explore corresponding, alternate, and interior angles.

**Tools:** Parallel line, segment or line, angle marker.

**Task:**

1. Draw one line.
2. Construct a parallel line through another point.
3. Draw a transversal crossing both lines.
4. Mark at least four angles.
5. Compare their measures.

**Questions:**

- Which angles are equal?
- Which angles add to `180°`?
- What changes when the transversal rotates?

**Extension:** Create a diagram that proves why alternate interior angles are equal.

### 12. Triangle Centers

**Goal:** Construct important triangle centers.

**Tools:** Triangle, perpendicular bisector, angle bisector, median or midpoint, intersection.

**Task:**

1. Construct a large triangle.
2. Find the midpoint of each side.
3. Draw medians from each vertex to the opposite midpoint.
4. Mark their intersection as the centroid.
5. Construct angle bisectors and compare their intersection with the centroid.

**Questions:**

- Are the centroid and angle-bisector intersection usually the same point?
- What happens in an equilateral triangle?

**Extension:** Construct the circumcenter using perpendicular bisectors.

### 13. Similar Triangles

**Goal:** Understand similarity and scale factor.

**Tools:** Polygon, dilation/scale, measurement, angle marker.

**Task:**

1. Create a triangle.
2. Make a scaled copy with scale factor `2`.
3. Measure corresponding sides.
4. Measure corresponding angles.

**Questions:**

- What happens to side lengths?
- What happens to angles?
- How does area change?

**Extension:** Create a third triangle with scale factor `0.5`.

### 14. Transform A Logo

**Goal:** Practice translation, rotation, reflection, and scaling.

**Tools:** Polygon, group, duplicate, translate, rotate, reflect, scale.

**Task:**

1. Create a simple polygon logo.
2. Duplicate it four times.
3. Translate one copy.
4. Rotate one copy.
5. Reflect one copy.
6. Scale one copy.
7. Label each transformation.

**Questions:**

- Which transformations preserve size?
- Which transformations preserve angle measures?
- Which transformation changes orientation?

**Extension:** Combine two transformations and describe the result.

## Level 4: Ages 16+

### 15. Equation Of A Line

**Goal:** Connect algebra and geometry.

**Tools:** Line by equation, point, measurement, labels.

**Task:**

1. Draw the line `y = 2x + 1`.
2. Place two points on the line.
3. Draw the line `y = -0.5x + 3`.
4. Find or estimate the intersection point.
5. Verify by solving the equations algebraically.

**Questions:**

- What is the slope of each line?
- Are the lines perpendicular? Explain.
- What is the intersection coordinate?

**Extension:** Create a line parallel to `y = 2x + 1` through point `(0, -2)`.

### 16. Circle Equation Investigation

**Goal:** Interpret circle equations.

**Tools:** Circle by equation, point, radius measurement.

**Task:**

1. Draw `(x - 2)^2 + (y + 1)^2 = 9`.
2. Identify the center and radius.
3. Add the center point and label it.
4. Add a point on the circle and measure the radius.

**Questions:**

- What is the center?
- Why is the radius `3`?
- How would the equation change if the center moved left by `4` units?

**Extension:** Create a circle tangent to the x-axis and write its equation.

### 17. Locus Design

**Goal:** Explore paths generated by points.

**Tools:** Parametric curve, conic, point, label.

**Task:**

1. Create a parametric circle using `x(t)=cos(t)`, `y(t)=sin(t)`.
2. Create an ellipse using `x(t)=3cos(t)`, `y(t)=sin(t)`.
3. Create a spiral-like curve if supported by the expression parser.
4. Compare the shapes.

**Questions:**

- Which parameter values trace a full circle?
- How does changing the coefficient of `cos(t)` affect the shape?
- Which curves are closed?

**Extension:** Design a decorative pattern using at least three parametric curves.

### 18. Proof By Construction

**Goal:** Use construction to support a geometric proof.

**Tools:** Triangle, midpoint, parallel line, measurement, labels.

**Task:**

1. Construct triangle `ABC`.
2. Mark the midpoint of `AB` as `M`.
3. Mark the midpoint of `AC` as `N`.
4. Connect `M` and `N`.
5. Measure `MN` and `BC`.
6. Check whether `MN` is parallel to `BC`.

**Questions:**

- What is the relationship between `MN` and `BC`?
- What theorem does this illustrate?
- How could you explain this without measurement?

**Extension:** Move the triangle vertices and test whether the relationship stays true.

## 3D Geometry Lab Activities

### 19. Build And Measure A Box

**Goal:** Understand cuboids, volume, and surface area.

**Tools:** 3D solid, cuboid, volume measurement, surface area measurement.

**Task:**

1. Create a cuboid with different width, depth, and height.
2. Measure or calculate its volume.
3. Measure or calculate its surface area.
4. Change one dimension and observe the result.

**Questions:**

- Which dimension affects volume the most when doubled?
- How does surface area change when height changes?

**Extension:** Design a box with volume exactly `24 u³`.

### 20. Nets Of Solids

**Goal:** Connect 3D solids to 2D nets.

**Tools:** Cube or prism, net tool, labels.

**Task:**

1. Create a cube.
2. Generate or draw its unfolded net.
3. Label corresponding faces.
4. Predict which faces touch when folded.

**Questions:**

- How many faces does the cube have?
- How many different cube nets can you make?

**Extension:** Create a rectangular prism net.

### 21. Cross-Section Slices

**Goal:** Visualize 2D slices through 3D solids.

**Tools:** Solid, work plane, cross-section.

**Task:**

1. Create a cube or prism.
2. Add a work plane through the solid.
3. Create the cross-section.
4. Change the plane angle and compare the slice.

**Questions:**

- What shape is the cross-section?
- How does the cross-section change when the plane rotates?

**Extension:** Try to create a triangular cross-section of a cube.

### 22. Dihedral Angle Explorer

**Goal:** Measure angles between faces.

**Tools:** 3D solid, face selection, dihedral angle measurement.

**Task:**

1. Create a cube.
2. Select two adjacent faces.
3. Measure the dihedral angle.
4. Create a pyramid and measure angles between its faces.

**Questions:**

- What is the dihedral angle between adjacent cube faces?
- Are all pyramid face angles the same?

**Extension:** Compare a cube, triangular prism, and pyramid.

## Team And Classroom Exercises

### 23. Partner Construction Challenge

**Goal:** Communicate geometric instructions precisely.

**Mode:** Team editable session or shared classroom session.

**Task:**

1. Student A creates a hidden target shape.
2. Student A writes construction instructions only.
3. Student B follows the instructions in Geometry Lab.
4. Both students compare the result with the target.

**Questions:**

- Which instruction was most important?
- Which instruction was unclear?
- How can geometry language become more precise?

### 24. Teacher Review Snapshot

**Goal:** Reflect on mathematical reasoning.

**Mode:** Assignment mode with teacher review.

**Task:**

1. Students complete one exercise from this pack.
2. Students add labels explaining each construction step.
3. Students submit a saved snapshot.
4. Teacher comments on one object and one measurement.
5. Students revise and resubmit.

**Reflection Prompt:**

Write three sentences:

1. What did you construct?
2. What measurement or relationship did you prove?
3. What changed after feedback?

## Quick Assessment Rubric

| Criterion | Emerging | Secure | Advanced |
| --- | --- | --- | --- |
| Construction accuracy | Objects are incomplete or not connected correctly. | Objects match the task and use appropriate tools. | Objects are precise, dynamic, and remain correct when moved. |
| Measurement use | Measurements are missing or unclear. | Measurements support the answer. | Measurements are used to explain a theorem or relationship. |
| Labels and explanation | Labels are missing or confusing. | Labels identify important points and shapes. | Labels and notes clearly explain the reasoning. |
| Tool fluency | Student needs frequent help. | Student uses common tools independently. | Student chooses efficient tools and explores extensions. |

## Suggested Progression

1. Coordinates and labels.
2. Segments, polygons, and basic angles.
3. Measurements: length, perimeter, area, angle.
4. Circles, tangents, and constructions.
5. Transformations and similarity.
6. Algebraic geometry: equations and curves.
7. 3D solids, nets, cross-sections, and volume.
8. Team sessions, reviews, and proof explanations.
