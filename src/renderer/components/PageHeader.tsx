/**
 * @file Shared page header
 * @description Provides consistent title, description, eyebrow, and action placement for views.
 */
import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => (
  <header className="page-header">
    <div className="page-header-copy">
      {eyebrow ? <span>{eyebrow}</span> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </header>
);

export default PageHeader;
