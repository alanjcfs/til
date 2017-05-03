/* concat! macro is only for literals. To use constants, you need to make a macro that returns that
 * constant
 */
fn main() {
    assert_eq!(concat!(true, false), "truefalse");
}
