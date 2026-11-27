/**
 * @file Animated formatted value
 * @description Remounts a final formatted KPI value so CSS can acknowledge data updates.
 */
import React from 'react';

interface AnimatedValueProps {
  value: string;
  className?: string;
  testId?: string;
  animateOnMount?: boolean;
}

const AnimatedValue: React.FC<AnimatedValueProps> = ({
  value,
  className,
  testId,
  animateOnMount = true,
}) => {
  const [motion, setMotion] = React.useState({ value, shouldAnimate: animateOnMount });
  if (motion.value !== value) {
    setMotion({ value, shouldAnimate: true });
  }
  const classes = [motion.shouldAnimate ? 'animated-value' : undefined, className]
    .filter(Boolean)
    .join(' ');

  return (
    <strong key={value} className={classes || undefined} data-testid={testId}>
      {value}
    </strong>
  );
};

export default AnimatedValue;
