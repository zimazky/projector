import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './Breadcrumbs.module.css';

interface PathSegment {
  id: string;
  name: string;
}

interface BreadcrumbsProps {
  currentPath: PathSegment[]; // Changed type to PathSegment[]
  onBreadcrumbClick: (folderId: string) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = observer(
  ({ currentPath, onBreadcrumbClick }) => {
    return (
      <div className={styles.breadcrumb}>
        {currentPath.map((segment, index) => (
          <React.Fragment key={segment.id}>
            <span
              className={styles.breadcrumbItem}
              onClick={() => onBreadcrumbClick(segment.id)}
            >
              {segment.name}
            </span>
            {index < currentPath.length - 1 && <span className={styles.breadcrumbSeparator}> / </span>}
          </React.Fragment>
        ))}
      </div>
    );
  }
);

export default Breadcrumbs;
