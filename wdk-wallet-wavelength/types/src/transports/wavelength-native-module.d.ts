declare const _default: {
    call(method: string, paramsJson: string): Promise<string>;
    startActivity(reqJson: string): Promise<void>;
    stopActivity(): Promise<void>;
};
export default _default;
