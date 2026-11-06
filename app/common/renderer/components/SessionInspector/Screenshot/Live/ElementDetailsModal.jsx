import {Modal} from 'antd';
import {useTranslation} from 'react-i18next';

import SelectedElement from '../../SourceTab/SelectedElement/SelectedElement.jsx';

import styles from './Live.module.css';

/**
 * Non-blocking dialog showing the Selected Element pane (locators, attributes, actions)
 * for the element chosen from the Live mode Inspect menu. Clicking a cell copies its value.
 */
const ElementDetailsModal = (props) => {
  const {open, onClose, selectedElement = {}} = props;
  const {t} = useTranslation();
  const hasElement = Object.keys(selectedElement).length > 0 && selectedElement.strategyMap;

  return (
    <Modal
      title={selectedElement.tagName || t('Selected Element')}
      open={open}
      onCancel={onClose}
      footer={null}
      mask={false}
      width={620}
      className={styles.detailsModal}
      destroyOnHidden
    >
      {hasElement && <SelectedElement {...props} />}
    </Modal>
  );
};

export default ElementDetailsModal;
