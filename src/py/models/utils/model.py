"""Model building utilities."""

import tensorflow as tf

from .attention import PMA, SAB


def create_dense_stack(
    units: tuple[int, ...], name: str, use_layer_norm=False, omit_last_ln=False
) -> list[tf.keras.layers.Layer]:
    """
    Creates a stack of dense layers for an input tensor.

    :param units: Size of each hidden layer.
    :param name: Name scope prefix.
    :param use_layer_norm: Whether to use layer normalization.
    :param omit_last_ln: If true and `use_layer_norm`, disables layer
    normalization for the final layer.
    """
    return [
        layer
        for i, hidden in enumerate(units)
        for layer in [
            tf.keras.layers.Dense(
                units=hidden,
                kernel_initializer="he_normal",
                bias_initializer="zeros",
                name=f"{name}/dense_{i+1}",
            ),
            *(
                [tf.keras.layers.LayerNormalization(name=f"{name}/ln_{i+1}")]
                if use_layer_norm and (not omit_last_ln or i != len(units) - 1)
                else []
            ),
            tf.keras.layers.ReLU(name=f"{name}/relu_{i+1}"),
        ]
    ]


def self_attention_block(
    num_heads: int,
    depth: int,
    rff_units: int,
    name: str,
    use_layer_norm=False,
) -> SAB:
    """
    Creates a self-attention block.

    :param num_heads: Number of attention heads.
    :param depth: Size of each attention head.
    :param rff_units: Size of feedforward layer.
    :param name: Name scope prefix.
    :param use_layer_norm: Whether to use layer normalization.
    """
    return SAB(
        num_heads=num_heads,
        depth=depth,
        rff=tf.keras.layers.Dense(
            units=rff_units,
            activation="relu",
            kernel_initializer="he_normal",
            bias_initializer="zeros",
            # Note: Layer/variable names will be scoped under outer layer name.
            name="rff",
        ),
        use_layer_norm=use_layer_norm,
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        name=f"{name}/sab",
    )


def pooling_attention(
    num_seeds: int,
    num_heads: int,
    depth: int,
    rff_units: int,
    rff_s_units: int,
    name: str,
    use_layer_norm=False,
) -> PMA:
    """
    Creates a pooling-attention block.

    :param num_seeds: Number of seed vectors for pooling.
    :param num_heads: Number of attention heads.
    :param depth: Size of each attention head.
    :param rff_units: Size of feedforward layer.
    :param rff_s_units: Size of pre-input feedforward layer.
    :param name: Name scope prefix.
    :param use_layer_norm: Whether to use layer normalization.
    """
    return PMA(
        num_seeds=num_seeds,
        num_heads=num_heads,
        depth=depth,
        rff=tf.keras.layers.Dense(
            units=rff_units,
            activation="relu",
            kernel_initializer="he_normal",
            bias_initializer="zeros",
            name="rff",
        ),
        rff_s=tf.keras.layers.Dense(
            units=rff_s_units,
            activation="relu",
            kernel_initializer="he_normal",
            bias_initializer="zeros",
            name="rff_s",
        ),
        use_layer_norm=use_layer_norm,
        seed_initializer="glorot_uniform",
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        name=f"{name}/pma",
    )
