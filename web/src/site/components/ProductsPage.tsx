// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { type ProductPlan } from '../data/traceData';
import { PricingSection } from './PricingSection';

interface ProductsPageProps {
  activeCategory: 'individual' | 'business';
  onCategoryChange: (category: 'individual' | 'business') => void;
  onSelectPlan: (plan: ProductPlan, billing: 'annual' | 'monthly') => void;
  onOpenEducation: () => void;
  onBackHome: () => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  activeCategory,
  onCategoryChange,
  onSelectPlan,
  onOpenEducation,
  onBackHome,
}) => {
  return (
    <div className="min-h-[82vh] blueprint-grid-bg text-[#202427]">
      <div className="max-w-[1200px] mx-auto px-6 pt-10">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#202427]/75 hover:text-[#202427] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Trace. Overview</span>
        </button>
      </div>

      <PricingSection
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        onSelectPlan={onSelectPlan}
        onOpenEducation={onOpenEducation}
      />
    </div>
  );
};
