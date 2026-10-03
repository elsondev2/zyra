import { Container, SelectList } from "../../../../../terminal/src/index.js";
/**
 * Component that renders a show images selector with borders
 */
export declare class ShowImagesSelectorComponent extends Container {
    private selectList;
    constructor(currentValue: boolean, onSelect: (show: boolean) => void, onCancel: () => void);
    getSelectList(): SelectList;
}
