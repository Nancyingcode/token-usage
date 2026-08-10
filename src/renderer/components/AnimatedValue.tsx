/**
 * @file Animated formatted value
 * @description Remounts a final formatted KPI value so CSS can acknowledge data updates.
 */
import React from 'react';

interface AnimatedValueProps {
  value: string;
  className?: string;
  testId?: string;
}

const AnimatedValue: React.FC<AnimatedValueProps> = ({ value, className, testId }) => {
  const classes = className ? `animated-value ${className}` : 'animated-value';

  return (
    <strong key={value} className={classes} data-testid={testId}>
      {value}
    </strong>
  );
};

export default AnimatedValue;
