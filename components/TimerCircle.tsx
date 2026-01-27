
import React, { useEffect, useState } from 'react';

interface TimerCircleProps {
  expiryTime: number;
  totalDuration: number;
  size?: number;
}

const TimerCircle: React.FC<TimerCircleProps> = ({ expiryTime, totalDuration, size = 40 }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const radius = (size / 2) - 4;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, expiryTime - Date.now());
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiryTime]);

  const percentage = (timeLeft / totalDuration) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (timeLeft < 60000) return 'stroke-red-500';
    if (timeLeft < 180000) return 'stroke-amber-500';
    return 'stroke-emerald-500';
  };

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-slate-200 stroke-current"
          strokeWidth="4"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${getColor()} stroke-current transition-all duration-1000 ease-linear`}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-slate-700">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
};

export default TimerCircle;
