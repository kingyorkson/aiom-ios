import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface TutorialProps {
  onComplete: () => void;
  isIOS?: boolean;
}

const Tutorial: React.FC<TutorialProps> = ({ onComplete, isIOS = false }) => {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);

  const baseSteps = [
    {
      title: "Welcome to AIOM",
      content: "Welcome to All in One Mods! This mod loader allows you to have all your mods in one place. It supports Forge, Fabric, NeoForge, and Quilt."
    },
    {
      title: "Mod Packs",
      content: "Create mod packs for different mod loaders! Mix and match mods into your packs. Your mod packs are stored in a custom folder, keeping everything organized."
    },
    {
      title: "Browse & Install",
      content: "Browse mods from Modrinth and CurseForge directly within the app. Install mods, resource packs, shaders, and worlds with a single click."
    },
    {
      title: "Minecraft Accounts",
      content: "Link your Microsoft account easily to play. We verify your purchase to ensure a legitimate experience."
    },
    {
      title: "Ready to Play?",
      content: "That's it! You are now ready to create your first mod pack and play with friends."
    }
  ];

  const iosStep = {
    title: "Mobile Controls",
    content: "It looks like you're using an iPhone or an iPad. It may be a little tricky playing this game, so we would recommend grabbing out a PlayStation controller, Xbox controller, or any controller you like. It will convert the control inputs from controller to keyboard for you automatically. Have fun with your mobile adventure. Also, make sure you have JIT enabled, and then you could just press the Done button."
  };

  const steps = isIOS ? [...baseSteps.slice(0, 4), iosStep, baseSteps[4]] : baseSteps;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center">
      <div className={`max-w-xl w-full p-8 rounded-2xl shadow-2xl ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-4">{steps[step].title}</h2>
          <p className="text-lg opacity-80 leading-relaxed">{steps[step].content}</p>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-8 bg-aiom-accent" : "w-2 bg-gray-500"}`} />
            ))}
          </div>
          
          <button 
            onClick={handleNext}
            className={`px-8 py-3 rounded-xl font-bold text-lg ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg hover:scale-105 transition-transform" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
          >
            {step === steps.length - 1 ? (isIOS ? "Done" : "Get Started") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center">
      <div className={`max-w-xl w-full p-8 rounded-2xl shadow-2xl ${theme === 'fancy' ? "bg-[#1e1e2e] border border-white/10 text-white" : "bg-[#c6c6c6] border-4 border-white text-black"}`}>
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-4">{steps[step].title}</h2>
          <p className="text-lg opacity-80 leading-relaxed">{steps[step].content}</p>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-8 bg-aiom-accent" : "w-2 bg-gray-500"}`} />
            ))}
          </div>
          
          <button 
            onClick={handleNext}
            className={`px-8 py-3 rounded-xl font-bold text-lg ${theme === 'fancy' ? "bg-aiom-accent text-aiom-bg hover:scale-105 transition-transform" : "bg-[#8b8b8b] text-white border-2 border-white"}`}
          >
            {step === steps.length - 1 ? (isIOS ? "Done" : "Get Started") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;

export default Tutorial;